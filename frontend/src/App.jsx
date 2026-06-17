import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import EmailReader from './components/EmailReader'
import Settings from './components/Settings'
import { ToastProvider, useToast } from './components/Toast'
import { useEmails } from './hooks/useEmails'
import { useSync } from './hooks/useSync'
import { getAccounts, getSettings, patchEmail, startScan, getScanStatus } from './api/client'

/**
 * Top-level shell. Holds the active view (inbox/important/settings), the
 * selected email, filter/search/page state, and wires the toast + sync hooks.
 * A triage toolbar with "Scan for Important Emails" sits above the email list.
 */
function MailMind() {
  const toast = useToast()
  const [view, setView] = useState('inbox')
  const [accounts, setAccounts] = useState([])
  const [settings, setSettings] = useState({ dark_mode: true, mock_mode: true })

  // Inbox state
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [page, setPage] = useState(1)
  const [selectedEmail, setSelectedEmail] = useState(null)

  // Triage state
  const [scanRunning, setScanRunning] = useState(false)
  const scanTimer = useRef(null)

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

  // When switching to the Important view, force the important filter.
  useEffect(() => {
    if (view === 'important') setFilter('important')
    else if (view === 'inbox' && filter === 'important') setFilter('all')
  }, [view])

  // ---- theme toggle ------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement
    if (settings.dark_mode) { root.classList.add('dark'); root.classList.remove('light') }
    else { root.classList.remove('dark'); root.classList.add('light') }
  }, [settings.dark_mode])

  // ---- toast bridge for sync events --------------------------------------
  const handleSyncEvent = useCallback((ev) => {
    if (ev.type === 'sync-done') {
      const triage = Array.isArray(ev.result) && ev.result.find((r) => r.triage)?.triage
      if (triage?.scanned) {
        toast.success(`Background sync done — auto-scanned ${triage.scanned} email(s).`)
      } else {
        toast.info('Background sync complete.')
      }
    } else if (ev.type === 'error') {
      toast.error(ev.message)
    }
  }, [toast])

  const { status: syncStatus, manualRunning, syncNow } = useSync({ onEvent: handleSyncEvent })

  // ---- emails hook -------------------------------------------------------
  const effectiveFilter = view === 'important' ? 'important' : filter
  const { data, loading, error, toggleRead, toggleStar, markReadLocally, setData } = useEmails({
    filter: effectiveFilter, q: debouncedQuery, account: selectedAccount, page,
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
      // Fire-and-forget the read-state patch.
      patchEmail(e.id, { is_read: true }).catch(() => {})
    }
  }, [markReadLocally])

  // ---- triage scan -------------------------------------------------------
  const pollScan = useCallback(async () => {
    clearInterval(scanTimer.current)
    scanTimer.current = setInterval(async () => {
      try {
        const s = await getScanStatus()
        if (!s.running) {
          clearInterval(scanTimer.current)
          setScanRunning(false)
          if (s.summary) {
            if (s.summary.unavailable) {
              toast.error('Ollama unavailable — start it or check the model name in Settings.')
            } else if (s.summary.scanned > 0) {
              toast.success(`Triage done: ${s.summary.scanned} scanned, ${s.summary.important} important.`)
            } else {
              toast.info('Triage done — no new emails to scan. Try "rescan all" to re-triage everything.')
            }
          }
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

  // ---- render ------------------------------------------------------------
  const showInbox = view === 'inbox' || view === 'important'

  return (
    <div className="h-screen flex bg-ink-950 text-ink-200">
      <Sidebar
        view={view}
        onView={setView}
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectAccount={(id) => { setSelectedAccount(id); setPage(1) }}
        syncStatus={syncStatus}
        mockMode={settings.mock_mode}
      />

      <div className="flex-1 flex min-w-0">
        {showInbox ? (
          <>
            <div className="flex flex-col w-full md:w-[420px] shrink-0">
              <TriageBar
                scanRunning={scanRunning || manualRunning}
                onScan={() => handleScan({ rescan: false })}
                onRescanAll={() => handleScan({ rescan: true })}
                onSyncNow={syncNow}
              />
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
              />
            </div>
            <EmailReader
              email={selectedEmail}
              account={selectedEmail ? accountsById[selectedEmail.account_id] : undefined}
              onToggleRead={toggleRead}
              onToggleStar={toggleStar}
              onClose={() => setSelectedEmail(null)}
              onToast={toast}
              onRescanned={onRescanned}
            />
          </>
        ) : (
          <Settings
            onToast={toast}
            onSettingsChanged={(s) => setSettings((cur) => ({ ...cur, ...s }))}
            onAccountsChanged={refreshAccounts}
          />
        )}
      </div>
    </div>
  )
}

/** Toolbar above the inbox with the main "Scan for Important Emails" action. */
function TriageBar({ scanRunning, onScan, onRescanAll, onSyncNow }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-800/60 bg-ink-950">
      <button
        onClick={onScan}
        disabled={scanRunning}
        className="px-3 py-1.5 rounded-md text-[13px] bg-accent-amber text-ink-950 font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {scanRunning ? <><Dot /> Scanning…</> : '⚡ Scan for Important'}
      </button>
      <button
        onClick={onRescanAll}
        disabled={scanRunning}
        className="px-2.5 py-1.5 rounded-md text-[12px] text-ink-300 border border-ink-700 hover:bg-ink-850 disabled:opacity-40"
        title="Re-triage every email, not just unscored ones"
      >
        Rescan all
      </button>
      <button
        onClick={onSyncNow}
        disabled={scanRunning}
        className="ml-auto px-2.5 py-1.5 rounded-md text-[12px] text-ink-300 border border-ink-700 hover:bg-ink-850 disabled:opacity-40"
      >
        Sync now
      </button>
    </div>
  )
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-ink-950/70 animate-pulse" />
}

export default function App() {
  return (
    <ToastProvider>
      <MailMind />
    </ToastProvider>
  )
}
