import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import EmailReader from './components/EmailReader'
import Settings from './components/Settings'
import ScanProgressBar from './components/ScanProgressBar'
import { ToastProvider, useToast } from './components/Toast'
import { useEmails } from './hooks/useEmails'
import { useSync } from './hooks/useSync'
import { getAccounts, getEmail, getSettings, patchEmail, startScan, getScanStatus, cancelScan } from './api/client'

/**
 * 3-panel glassmorphic shell (resizable):
 *   [ icon rail ][ flexible mail list ][ reader ]
 * Ambient color orbs sit behind everything (fixed, in index.css) so the glass
 * surfaces have something to refract.
 */
function MailMind() {
  const toast = useToast()
  const [view, setView] = useState('inbox')        // inbox | important | starred | settings
  const [accounts, setAccounts] = useState([])
  const [settings, setSettings] = useState({ dark_mode: true, mock_mode: true })

  // Inbox state
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [bodyLoading, setBodyLoading] = useState(false)

  // Triage state
  const [scanRunning, setScanRunning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 })
  const scanTimer = useRef(null)
  // Bumped whenever a scan finishes, so the email list re-fetches to surface
  // freshly-generated AI summaries (replacing the "Analyzing…" placeholders).
  const [scanTick, setScanTick] = useState(0)
  // Bumped whenever a background sync finishes, so the email list re-fetches to
  // surface updated read/unread state and newly-arrived emails in real time.
  const [syncTick, setSyncTick] = useState(0)

  // ---- settings + accounts bootstrap -------------------------------------
  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    refreshAccounts()
  }, [])

  const refreshAccounts = useCallback(() => {
    getAccounts().then((a) => setAccounts(a.accounts)).catch(() => {})
  }, [])

  // Debounce search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Sync the filter with the active nav view.
  useEffect(() => {
    if (view === 'important') setFilter('important')
    else if (view === 'starred') setFilter('starred')
    else if (view === 'inbox' && (filter === 'important' || filter === 'starred')) setFilter('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // ---- toast bridge for sync events --------------------------------------
  const handleSyncEvent = useCallback((ev) => {
    if (ev.type === 'sync-done') {
      const triage = Array.isArray(ev.result) && ev.result.find((r) => r.triage)?.triage
      if (triage?.scanned) {
        toast.success(`Background sync done — auto-scanned ${triage.scanned} email(s).`)
      } else {
        toast.info('Background sync complete.')
      }
      // Re-fetch the list so read/unread state and new emails from Gmail
      // show up in real time without a manual refresh.
      setSyncTick((t) => t + 1)
    } else if (ev.type === 'error') {
      toast.error(ev.message)
    }
  }, [toast])

  const { status: syncStatus, manualRunning, syncNow } = useSync({ onEvent: handleSyncEvent })

  // ---- emails hook -------------------------------------------------------
  const effectiveFilter = view === 'important' ? 'important'
    : view === 'starred' ? 'starred' : filter
  const { data, loading, error, toggleRead, toggleStar, markReadLocally, setData } = useEmails({
    filter: effectiveFilter, q: debouncedQuery, account: selectedAccount, page,
    refreshKey: scanTick + syncTick,
  })

  // Refresh the selected email object when the list updates (e.g. after toggle).
  useEffect(() => {
    if (!selectedEmail) return
    const fresh = data.emails.find((e) => e.id === selectedEmail.id)
    if (fresh && fresh !== selectedEmail) setSelectedEmail(fresh)
  }, [data.emails, selectedEmail])

  const onSelectEmail = useCallback((e) => {
    setSelectedEmail(e)
    if (!e.is_read) {
      markReadLocally(e.id)
      patchEmail(e.id, { is_read: true }).catch(() => {})
    }
    // Lazy-load the full body — list payload only carries a short preview.
    setBodyLoading(true)
    getEmail(e.id)
      .then((full) => {
        setSelectedEmail((cur) => (cur && cur.id === full.id ? { ...cur, ...full } : cur))
        setData((d) => ({
          ...d,
          emails: d.emails.map((row) => (row.id === full.id ? { ...row, ...full } : row)),
        }))
      })
      .catch(() => { /* header fields already shown; body stays as preview */ })
      .finally(() => setBodyLoading(false))
  }, [markReadLocally, setData])

  // ---- triage scan -------------------------------------------------------
  const pollScan = useCallback(async () => {
    clearInterval(scanTimer.current)
    scanTimer.current = setInterval(async () => {
      try {
        const s = await getScanStatus()
        // Live progress for the sidebar bar.
        if (s.running) setScanProgress({ scanned: s.scanned || 0, total: s.total || 0 })
        if (!s.running) {
          clearInterval(scanTimer.current)
          setScanRunning(false)
          setScanProgress({ scanned: 0, total: 0 })
          if (s.summary) {
            if (s.summary.unavailable) {
              toast.error('Ollama unavailable — start it or check the model name in Settings.')
            } else if (s.summary.scanned > 0) {
              toast.success(`Triage done: ${s.summary.scanned} scanned, ${s.summary.important} important.`)
            } else {
              toast.info('Triage done — no new emails to scan. Try "rescan all" to re-triage everything.')
            }
          }
          // Re-fetch the list so AI summaries replace any "Analyzing…" placeholders.
          setScanTick((t) => t + 1)
        }
      } catch { /* keep polling */ }
    }, 1500)
  }, [toast])

  const handleScan = useCallback(async ({ rescan = false } = {}) => {
    if (scanRunning) return
    setScanRunning(true)
    try {
      await startScan({ background: true, rescan })
      toast.info(rescan ? 'Re-scanning all emails…' : 'Scanning unscored emails…')
      pollScan()
    } catch (e) {
      setScanRunning(false)
      toast.error(`Scan failed to start: ${e.message}`)
    }
  }, [scanRunning, toast, pollScan])

  const onRescanned = useCallback((updated) => {
    setData((d) => ({ ...d, emails: d.emails.map((e) => (e.id === updated.id ? updated : e)) }))
    setSelectedEmail((cur) => (cur && cur.id === updated.id ? updated : cur))
  }, [setData])

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])

  const showInbox = view === 'inbox' || view === 'important' || view === 'starred'

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Ambient color orbs — behind everything so glass can refract them. */}
      <div className="ambient-orbs" aria-hidden><div className="orb" /></div>

      {/* The 3-panel shell sits above the orbs. */}
      <div className="relative z-10 h-full flex">
        <Sidebar
          view={view}
          onView={setView}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={(id) => { setSelectedAccount(id); setPage(1) }}
          syncStatus={syncStatus}
          mockMode={settings.mock_mode}
          scanRunning={scanRunning || manualRunning}
          onScan={() => handleScan({ rescan: false })}
          onRescanAll={() => handleScan({ rescan: true })}
          onSyncNow={syncNow}
        />
        {showInbox ? (
          <Group orientation="horizontal" className="flex-1 min-w-0 h-full">
            <Panel defaultSize={52} minSize={25}>
              <EmailList
                filter={effectiveFilter}
                onFilter={(f) => { setFilter(f); setPage(1) }}
                query={query}
                onQuery={setQuery}
                data={data}
                loading={loading}
                error={error}
                accounts={accounts}
                selectedAccount={selectedAccount}
                selectedEmailId={selectedEmail?.id}
                onSelectEmail={onSelectEmail}
                onToggleRead={toggleRead}
                onToggleStar={toggleStar}
                page={page}
                onPageChange={setPage}
                view={view}
              />
            </Panel>
            <Separator className="resize-handle" />
            <Panel defaultSize={48} minSize={20}>
              <EmailReader
                email={selectedEmail}
                account={selectedEmail ? accountsById[selectedEmail.account_id] : undefined}
                bodyLoading={bodyLoading}
                onToggleRead={toggleRead}
                onToggleStar={toggleStar}
                onClose={() => setSelectedEmail(null)}
                onToast={toast}
                onRescanned={onRescanned}
              />
            </Panel>
          </Group>
        ) : (
          <Settings
            onBack={() => setView('inbox')}
            onToast={toast}
            onSettingsChanged={(s) => setSettings((cur) => ({ ...cur, ...s }))}
            onAccountsChanged={refreshAccounts}
          />
        )}
      </div>

      {/* Fixed bottom scan-progress bar — spans the full app width. */}
      <ScanProgressBar
        progress={scanRunning ? scanProgress : null}
        onCancel={async () => {
          try {
            await cancelScan()
            toast.info('Cancel requested — will stop after current batch.')
          } catch (e) {
            toast.error(`Cancel failed: ${e.message}`)
          }
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <MailMind />
    </ToastProvider>
  )
}
