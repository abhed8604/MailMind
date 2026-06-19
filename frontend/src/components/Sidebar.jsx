import {
  MailIcon, ScanIcon, RescanIcon, DownloadIcon, SendIcon, StarIcon,
  SettingsIcon,
} from './Icon'

/**
 * Panel 1 — narrow 48px icon sidebar.
 *
 * Top→down: mail, bolt/flash (scan), refresh (rescan), download (sync), send,
 * star. Bottom: connected-account dots (colored per-account, click to filter
 * that account; click again to clear), then the settings icon last.
 */
export default function Sidebar({
  view, onView,
  syncStatus, mockMode, scanRunning, onScan, onRescanAll, onSyncNow,
  amoled,
  accounts = [],
  selectedAccount,
  onSelectAccount,
  accountColorMap,
}) {
  return (
    <aside
      className="w-[48px] shrink-0 h-full flex flex-col items-center py-3 overflow-hidden"
      style={{ background: amoled ? '#000000' : '#0e0e1a', borderRight: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Top icon group */}
      <div className="flex flex-col items-center gap-1.5">
        <IconBtn label="Mail" active={view === 'inbox'} onClick={() => onView('inbox')}>
          <MailIcon width={18} height={18} />
        </IconBtn>
        <IconBtn
          label="Scan Important"
          onClick={onScan}
          disabled={scanRunning}
        >
          <ScanIcon width={18} height={18} />
        </IconBtn>
        <IconBtn
          label="Rescan all"
          onClick={onRescanAll}
          disabled={scanRunning}
        >
          <RescanIcon width={18} height={18} />
        </IconBtn>
        <IconBtn
          label="Sync / Download"
          onClick={onSyncNow}
          disabled={scanRunning}
        >
          <DownloadIcon width={18} height={18} />
        </IconBtn>
        <IconBtn
          label="Compose / Send"
          onClick={() => onView('inbox')}
          disabled
        >
          <SendIcon width={18} height={18} />
        </IconBtn>
        <IconBtn
          label="Starred"
          active={view === 'starred'}
          onClick={() => onView('starred')}
        >
          <StarIcon width={18} height={18} />
        </IconBtn>
      </div>

      {/* Spacer pushes accounts + settings to the bottom */}
      <div className="flex-1" />

      {/* Connected accounts (clickable to filter) */}
      {accounts.length > 0 && (
        <div className="flex flex-col items-center gap-1.5 mb-2">
          {accounts.map((a) => {
            const ramp = (accountColorMap && accountColorMap.get(a.id)) || { color: 'rgba(255,255,255,0.55)', pillBg: 'rgba(255,255,255,0.10)' }
            const active = selectedAccount === a.id
            const initial = (a.email || '?').charAt(0).toUpperCase()
            return (
              <button
                key={a.id}
                type="button"
                title={a.needs_reauth ? `${a.email} — needs re-auth` : a.email}
                aria-label={a.needs_reauth ? `${a.email} — needs re-auth` : a.email}
                onClick={() => onSelectAccount?.(a.id)}
                className="h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                style={{
                  background: ramp.pillBg,
                  color: ramp.color,
                  fontSize: '11px',
                  fontWeight: 600,
                  border: active ? `1.5px solid ${ramp.color}` : '1.5px solid transparent',
                }}
              >
                {a.needs_reauth ? '!' : initial}
              </button>
            )
          })}
        </div>
      )}

      {/* Settings */}
      <IconBtn label="Settings" active={view === 'settings'} onClick={() => onView('settings')}>
        <SettingsIcon width={18} height={18} />
      </IconBtn>
    </aside>
  )
}

/** Square icon button — 34×34px, border-radius 8px, flat color states. */
function IconBtn({ children, label, active, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-[34px] w-[34px] rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: active ? 'rgba(91,141,239,0.18)' : 'transparent',
        color: active ? '#7eaaff' : 'rgba(255,255,255,0.28)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.28)'
      }}
    >
      {children}
    </button>
  )
}
