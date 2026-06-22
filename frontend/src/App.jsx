import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import EmailReader from './components/EmailReader'
import Settings from './components/Settings'
import { ToastProvider, useToast } from './components/Toast'
import { useEmails } from './hooks/useEmails'
import { useSync } from './hooks/useSync'
import { useResizable } from './hooks/useResizable'
import { useIsMobile } from './hooks/useIsMobile'
import { useSwipeToOpen } from './hooks/useSwipeToOpen'
import { useMobileBackButton } from './hooks/useMobileBackButton'
import { getAccounts, getEmail, getSettings, patchEmail, startScan, getScanStatus, cancelScan, getModelStatus, warmupModel } from './api/client'
import { buildAccountColorMap } from './lib/company'

/**
 * 3-panel flat dark shell (desktop) / stacked full-screen panels (mobile):
 *   Desktop:  [ 48px sidebar ][ resizable list ][ reader ]
 *   Mobile:   hamburger → drawer sidebar, list full-width, reader full-screen overlay
 */
function MailMind() {
  const toast = useToast()
  const [view, setView] = useState('inbox')        // inbox | settings
  const [accounts, setAccounts] = useState([])
  const [settings, setSettings] = useState({ dark_mode: true, mock_mode: true })
  const isMobile = useIsMobile()

  // Mobile drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Swipe from the left edge (only on mobile, only when the drawer is closed).
  useSwipeToOpen({
    enabled: isMobile && !sidebarOpen,
    onOpen: () => setSidebarOpen(true),
  })

  // AMOLED mode — persisted to localStorage
  const [amoled, setAmoled] = useState(() => {
    try { return localStorage.getItem('amoled_mode') === 'true' } catch { return false }
  })
  const handleAmoledChange = useCallback((v) => {
    setAmoled(v)
    try { localStorage.setItem('amoled_mode', String(v)) } catch { /* ignore */ }
  }, [])

  // Inbox state
  const [filter, setFilter] = useState('important')
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

  // LLM model status — mirrors the backend warmup state.
  const [modelStatus, setModelStatus] = useState('unknown')
  const [modelBusy, setModelBusy] = useState(false)

  // ---- settings + accounts bootstrap -------------------------------------
  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
    refreshAccounts()
  }, [])

  const refreshAccounts = useCallback(() => {
    getAccounts().then((a) => setAccounts(a.accounts)).catch(() => {})
  }, [])

  // ---- LLM model status polling ------------------------------------------
  // Poll the backend for the model warmup state so the sidebar indicator stays
  // accurate. While loading, poll faster; otherwise every 30s.
  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const s = await getModelStatus()
        if (active) setModelStatus(s.status || 'unknown')
      } catch { /* ignore */ }
    }
    tick()
    const interval = modelStatus === 'loading' ? 2000 : 30000
    const id = setInterval(tick, interval)
    return () => { active = false; clearInterval(id) }
  }, [modelStatus])

  const handleWarmupModel = useCallback(async () => {
    if (modelBusy) return
    setModelBusy(true)
    setModelStatus('loading')
    try {
      await warmupModel(true)
      toast.info('Starting LLM model…')
    } catch (e) {
      toast.error(`Could not start model: ${e.message}`)
      setModelStatus('unavailable')
    } finally {
      setModelBusy(false)
    }
  }, [modelBusy, toast])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Reset to page 1 whenever the sidebar view changes. The `filter` (tab)
  // is kept independent — switching views never resets the active tab.
  useEffect(() => { setPage(1) }, [view])

  // ---- emails hook -------------------------------------------------------
  // The tab filter is sent directly to the API (all|unread|important|starred).
  const apiFilter = filter
  const { data, loading, error, toggleRead, toggleStar, markReadLocally, setData } = useEmails({
    filter: apiFilter, q: debouncedQuery, account: selectedAccount, page,
    refreshKey: scanTick + syncTick,
  })

  // On desktop the API already handles tab filtering. On mobile the same
  // applies — no extra client-side layer needed.
  const visibleData = data

  // Refresh selected email when the list updates — but preserve the heavy
  // body fields. The list endpoint returns a lightweight shape (no body_html /
  // body_text), so we merge the fresh list fields onto the already-loaded full
  // email instead of replacing it. Otherwise the body would vanish on every
  // background refresh.
  useEffect(() => {
    if (!selectedEmail) return
    const fresh = data.emails.find((e) => e.id === selectedEmail.id)
    if (fresh && fresh !== selectedEmail) {
      setSelectedEmail((cur) => (cur && cur.id === fresh.id
        ? { ...cur, ...fresh, body_html: cur.body_html, body_text: cur.body_text }
        : cur))
    }
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
              toast.error('Ollama unavailable. Start it or check the model name in Settings.')
            } else if (s.summary.scanned > 0) {
              toast.success(`Triage done: ${s.summary.scanned} scanned, ${s.summary.important} important.`)
            } else {
              toast.info('Triage done. No new emails to scan. Try "rescan all" to re-triage everything.')
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

  // Keep a ref to handleScan so the sync event callback always calls the latest
  // version without getting stale.
  const handleScanRef = useRef(handleScan)
  handleScanRef.current = handleScan

  // ---- toast bridge for sync events --------------------------------------
  const handleSyncEvent = useCallback((ev) => {
    if (ev.type === 'sync-done') {
      const triage = Array.isArray(ev.result) && ev.result.find((r) => r.triage)?.triage
      if (triage?.scanned) {
        toast.success(`Background sync done. Auto-scanned ${triage.scanned} email(s).`)
      } else {
        toast.info('Background sync complete.')
      }
      setSyncTick((t) => t + 1)
      // If new mail arrived but nothing was auto-scanned (e.g. model wasn't
      // ready at sync time), kick off a scan now so new emails get triaged.
      const totalFetched = Array.isArray(ev.result)
        ? ev.result.reduce((n, r) => n + (r && typeof r === 'object' && 'added' in r ? (r.added || 0) : 0), 0)
        : 0
      if (totalFetched > 0 && !triage?.scanned && settings.auto_scan && modelStatus === 'ready') {
        handleScanRef.current({ rescan: false })
      }
    } else if (ev.type === 'error') {
      toast.error(ev.message)
    }
  }, [toast, settings.auto_scan, modelStatus])

  const { status: syncStatus, manualRunning, syncNow } = useSync({ onEvent: handleSyncEvent })

  const onRescanned = useCallback((updated) => {
    setData((d) => ({ ...d, emails: d.emails.map((e) => (e.id === updated.id ? updated : e)) }))
    setSelectedEmail((cur) => (cur && cur.id === updated.id ? updated : cur))
  }, [setData])

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])
  const accountColorMap = useMemo(() => buildAccountColorMap(accounts), [accounts])

  const showInbox = view !== 'settings'

  // Draggable divider between the list panel and the reading pane.
  const { leftPct, onPointerDown: onDividerDown, dragging } = useResizable({ initial: 38, min: 20, max: 70 })

  // Whether the reading pane is visible — drives the slide-in/out animation.
  const readerOpen = !!selectedEmail

  // Back button closes overlays (reader first, then sidebar drawer, then
  // settings) instead of exiting the PWA. A single hook manages one history
  // entry + one popstate listener for the whole app — the old three-hook
  // setup raced on history.pushState/back and left the back button dead.
  useMobileBackButton(isMobile, [
    { isOpen: readerOpen, close: () => setSelectedEmail(null) },
    { isOpen: sidebarOpen && !readerOpen, close: () => setSidebarOpen(false) },
    { isOpen: view === 'settings' && !readerOpen && !sidebarOpen, close: () => setView('inbox') },
  ])

  // Switching view via the sidebar should close the mobile drawer.
  const handleViewChange = useCallback((v) => {
    setView(v)
    setSidebarOpen(false)
  }, [])

  const sidebarProps = {
    view,
    onView: handleViewChange,
    syncStatus,
    mockMode: settings.mock_mode,
    scanRunning: scanRunning || manualRunning,
    onScan: () => handleScan({ rescan: false }),
    onRescanAll: () => handleScan({ rescan: true }),
    onSyncNow: syncNow,
    modelStatus,
    modelBusy,
    onWarmupModel: handleWarmupModel,
    amoled,
    accounts,
    selectedAccount,
    onSelectAccount: handleSelectAccount,
    accountColorMap,
  }

  const reader = (
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
          toast.info('Cancel requested. Will stop after current batch.')
        } catch (e) {
          toast.error(`Cancel failed: ${e.message}`)
        }
      }}
      amoled={amoled}
      accountColorMap={accountColorMap}
    />
  )

  // ---- MOBILE LAYOUT -----------------------------------------------------
  // Drawer sidebar opens via the hamburger button (now inside the list header
  // next to "Inbox") or a left-edge swipe. Reader is a full-screen overlay.
  // On Settings there's no hamburger — the back button already exits.
  if (isMobile) {
    return (
      <div className={`app-shell${amoled ? ' amoled' : ''}`}>
        {/* Drawer sidebar */}
        {sidebarOpen && (
          <>
            <div className="mobile-drawer-backdrop" onClick={() => setSidebarOpen(false)} />
            <div className="mobile-sidebar-drawer">
              <Sidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {showInbox ? (
          // Only ONE of list/reader visible at a time on mobile.
          readerOpen ? (
            <div className={`mobile-reader-overlay${amoled ? ' amoled' : ''}`}>
              {reader}
            </div>
          ) : (
            <div className="mm-mobile-list-top" style={{ flex: '1 1 0%', minHeight: 0 }}>
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
                view="inbox"
                style={{ flex: '1 1 0%' }}
                amoled={amoled}
                accountColorMap={accountColorMap}
                onOpenMenu={() => setSidebarOpen(true)}
                onRefresh={syncNow}
              />
            </div>
          )
        ) : (
          <div className="mm-mobile-list-top" style={{ flex: '1 1 0%', minHeight: 0 }}>
            <Settings
              onBack={() => setView('inbox')}
              onToast={toast}
              onSettingsChanged={(s) => setSettings((cur) => ({ ...cur, ...s }))}
              onAccountsChanged={refreshAccounts}
              amoled={amoled}
              onAmoledChange={handleAmoledChange}
              style={{ flex: '1 1 0%' }}
              accountColorMap={accountColorMap}
            />
          </div>
        )}
      </div>
    )
  }

  // ---- DESKTOP LAYOUT ----------------------------------------------------
  return (
    <div className={`app-shell${amoled ? ' amoled' : ''}`}>
      {/* 3-column flex layout: fixed sidebar + resizable list/reader area */}
      <div className="flex h-full w-full">
        <Sidebar {...sidebarProps} />
        {/* This wrapper takes all remaining width after the 48px sidebar,
            so the list/reader percentages (38%/62%) sum to 100% of the
            remaining space — no overflow. */}
        <div className="flex h-full flex-1 min-w-0">
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
                view="inbox"
                style={{
                  flex: `0 0 ${leftPct}%`,
                  transform: readerOpen ? 'translateX(0)' : `translateX(${(100 - leftPct) / (2 * leftPct) * 100}%)`,
                  transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
                  overflow: 'hidden',
                  willChange: 'transform',
                }}
                amoled={amoled}
                accountColorMap={accountColorMap}
                onRefresh={syncNow}
              />
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
                {reader}
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
              style={{ flex: '1 1 0%', maxWidth: 760, margin: '0 auto' }}
              accountColorMap={accountColorMap}
            />
          )}
        </div>
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
