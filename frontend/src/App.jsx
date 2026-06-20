import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import EmailReader from './components/EmailReader'
import Settings from './components/Settings'
import { ToastProvider, useToast } from './components/Toast'
import { useEmails } from './hooks/useEmails'
import { useSync } from './hooks/useSync'
import { useResizable } from './hooks/useResizable'
import { getAccounts, getEmail, getSettings, patchEmail, startScan, getScanStatus, cancelScan } from './api/client'
import { buildAccountColorMap } from './lib/company'

/**
 * 3-panel flat dark shell (fixed widths):
 *   [ 48px sidebar ][ 272px list ][ flex:1 reader ]
 * No resizable panels — widths are fixed per the design spec.
 */
function MailMind() {
  const toast = useToast()
  const [view, setView] = useState('inbox')        // inbox | important | starred | settings
  const [accounts, setAccounts] = useState([])
  const [settings, setSettings] = useState({ dark_mode: true, mock_mode: true })

  // AMOLED mode — persisted to localStorage
  const [amoled, setAmoled] = useState(() => {
    try { return localStorage.getItem('amoled_mode') === 'true' } catch { return false }
  })
  const handleAmoledChange = useCallback((v) => {
    setAmoled(v)
    try { localStorage.setItem('amoled_mode', String(v)) } catch { /* ignore */ }
  }, [])

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
  const [scanTick, setScanTick] = useState(0)
  const [syncTick, setSyncTick] = useState(0)

  // ---- settings + accounts bootstrap -------------------------------------
  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    refreshAccounts()
  }, [])

  const refreshAccounts = useCallback(() => {
    getAccounts().then((a) => setAccounts(a.accounts)).catch(() => {})
  }, [])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Reset to page 1 whenever the sidebar view changes. The `filter` (tab)
  // is kept independent — switching views never resets the active tab.
  useEffect(() => { setPage(1) }, [view])

  // ---- toast bridge for sync events --------------------------------------
  const handleSyncEvent = useCallback((ev) => {
    if (ev.type === 'sync-done') {
      const triage = Array.isArray(ev.result) && ev.result.find((r) => r.triage)?.triage
      if (triage?.scanned) {
        toast.success(`Background sync done — auto-scanned ${triage.scanned} email(s).`)
      } else {
        toast.info('Background sync complete.')
      }
      setSyncTick((t) => t + 1)
    } else if (ev.type === 'error') {
      toast.error(ev.message)
    }
  }, [toast])

  const { status: syncStatus, manualRunning, syncNow } = useSync({ onEvent: handleSyncEvent })

  // ---- emails hook -------------------------------------------------------
  // The API filter follows the sidebar VIEW (important/starred show those
  // scopes; inbox returns everything and the tab filters client-side). The
  // tab `filter` is layered on top via `visibleData` below.
  const apiFilter = view === 'important' ? 'important'
    : view === 'starred' ? 'starred'
    : filter
  const { data, loading, error, toggleRead, toggleStar, markReadLocally, setData } = useEmails({
    filter: apiFilter, q: debouncedQuery, account: selectedAccount, page,
    refreshKey: scanTick + syncTick,
  })

  // Layer the active TAB on top of the sidebar VIEW's results. In inbox the
  // API already applies the tab; in important/starred the API returns the
  // whole view and we narrow further by tab here.
  const visibleData = useMemo(() => {
    if (view === 'inbox') return data
    if (filter === 'all' || filter === view) return data
    const emails = data.emails.filter((e) => {
      if (filter === 'unread') return !e.is_read
      if (filter === 'important') return e.important
      if (filter === 'starred') return e.is_starred
      return true
    })
    return { ...data, emails, total: emails.length }
  }, [data, view, filter])

  // Refresh selected email when list updates
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

  // Click an account in the sidebar → filter to it. Click the same account
  // again → clear the filter (show mail from all accounts). This applies to
  // inbox, unread, AND important views.
  const handleSelectAccount = useCallback((id) => {
    setSelectedAccount((cur) => {
      const next = cur === id ? null : id
      setPage(1)
      return next
    })
  }, [])

  // ---- triage scan -------------------------------------------------------
  const pollScan = useCallback(async () => {
    clearInterval(scanTimer.current)
    scanTimer.current = setInterval(async () => {
      try {
        const s = await getScanStatus()
        if (s.running) setScanProgress({ scanned: s.scanned || 0, total: s.total || 0 })
        if (!s.running) {
          clearInterval(scanTimer.current)
          setScanRunning(false)
          // Keep progress around so the pill can show its "ready" state
          // (100/100) before its 2.5s fade-out timer fires.
          if (s.total) setScanProgress({ scanned: s.total, total: s.total })
          setTimeout(() => setScanProgress({ scanned: 0, total: 0 }), 3000)
          if (s.summary) {
            if (s.summary.unavailable) {
              toast.error('Ollama unavailable — start it or check the model name in Settings.')
            } else if (s.summary.scanned > 0) {
              toast.success(`Triage done: ${s.summary.scanned} scanned, ${s.summary.important} important.`)
            } else {
              toast.info('Triage done — no new emails to scan. Try "rescan all" to re-triage everything.')
            }
          }
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
  const accountColorMap = useMemo(() => buildAccountColorMap(accounts), [accounts])

  const showInbox = view === 'inbox' || view === 'important' || view === 'starred'

  // Draggable divider between the list panel and the reading pane.
  const { leftPct, onPointerDown: onDividerDown, dragging } = useResizable({ initial: 38, min: 20, max: 70 })

  // Whether the reading pane is visible — drives the slide-in/out animation.
  const readerOpen = !!selectedEmail

  return (
    <div className={`app-shell${amoled ? ' amoled' : ''}`}>
      {/* 3-column flex layout */}
      <div className="flex h-full w-full">
        <Sidebar
          view={view}
          onView={setView}
          syncStatus={syncStatus}
          mockMode={settings.mock_mode}
          scanRunning={scanRunning || manualRunning}
          onScan={() => handleScan({ rescan: false })}
          onRescanAll={() => handleScan({ rescan: true })}
          onSyncNow={syncNow}
          amoled={amoled}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={handleSelectAccount}
          accountColorMap={accountColorMap}
        />
        {showInbox ? (
          <>
            <EmailList
              filter={filter}
              onFilter={(f) => { setFilter(f); setPage(1) }}
              query={query}
              onQuery={setQuery}
              data={visibleData}
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
              style={{
                flex: `0 0 ${leftPct}%`,
                transform: readerOpen ? 'translateX(0)' : `translateX(${(100 - leftPct) / (2 * leftPct) * 100}%)`,
                transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
                willChange: 'transform',
              }}
              amoled={amoled}
              accountColorMap={accountColorMap}
            />
            {/* Draggable resize divider */}
            <div
              className="resize-divider"
              data-resizer="true"
              data-resizer-active={dragging ? 'true' : 'false'}
              onPointerDown={onDividerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              style={{
                flex: `0 0 ${readerOpen ? 4 : 0}px`,
                flexShrink: 0,
                opacity: readerOpen ? 1 : 0,
                overflow: 'hidden',
                pointerEvents: readerOpen ? 'auto' : 'none',
                transition: 'flex 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
              }}
            />
            {/* Reading pane — slides in from right when an email is selected.
                Uses transform (GPU compositor) in sync with the list's transform
                so both slide together as one smooth motion. */}
            <div style={{
              flex: `0 0 calc(${100 - leftPct}% - ${readerOpen ? 4 : 0}px)`,
              transform: readerOpen ? 'translateX(0)' : 'translateX(100%)',
              opacity: readerOpen ? 1 : 0,
              overflow: 'hidden',
              transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
              willChange: 'transform',
            }}>
              <EmailReader
                email={selectedEmail}
                account={selectedEmail ? accountsById[selectedEmail.account_id] : undefined}
                bodyLoading={bodyLoading}
                onToggleRead={toggleRead}
                onToggleStar={toggleStar}
                onClose={() => setSelectedEmail(null)}
                onToast={toast}
                onRescanned={onRescanned}
                scanRunning={scanRunning}
                scanProgress={scanProgress}
                onCancelScan={async () => {
                  try {
                    await cancelScan()
                    toast.info('Cancel requested — will stop after current batch.')
                  } catch (e) {
                    toast.error(`Cancel failed: ${e.message}`)
                  }
                }}
                amoled={amoled}
                accountColorMap={accountColorMap}
              />
            </div>
          </>
        ) : (
          <Settings
            onBack={() => setView('inbox')}
            onToast={toast}
            onSettingsChanged={(s) => setSettings((cur) => ({ ...cur, ...s }))}
            onAccountsChanged={refreshAccounts}
            amoled={amoled}
            onAmoledChange={handleAmoledChange}
            style={{
              flex: `0 0 ${leftPct}%`,
              margin: '0 auto',
            }}
            accountColorMap={accountColorMap}
          />
        )}
      </div>
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
