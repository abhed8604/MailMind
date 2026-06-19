import {
  ScanIcon, RescanIcon, SyncIcon, InboxIcon, ImportantIcon, StarIcon, SettingsIcon,
  LogoMark,
} from './Icon'

/**
 * Panel 1 — slim icon sidebar (fixed width).
 *
 * Top:   logo mark + wordmark (rotated/stacked to fit the narrow rail)
 * Below: 3 compact action buttons stacked vertically
 *          · Scan Important  (amber fill)
 *          · Rescan all      (ghost, glass border)
 *          · Sync now        (ghost, glass border)
 * Thin glass divider, then nav icons (Inbox / Important / Starred).
 * Bottom: connected account avatars as colored circles with a glow ring,
 *         and a settings icon pinned to the very bottom.
 */
export default function Sidebar({
  view, onView, accounts, selectedAccount, onSelectAccount,
  syncStatus, mockMode, scanRunning, onScan, onRescanAll, onSyncNow,
}) {
  return (
    <aside
      className="w-[62px] shrink-0 h-full flex flex-col items-center py-3 glass-subtle overflow-hidden"
      style={{ borderRight: '0.5px solid rgba(255,255,255,0.06)' }}
    >
      {/* Logo */}
      <div className="flex flex-col items-center gap-1 mb-3">
        <LogoMark />
      </div>

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-2">
        <ActionBtn label="Scan Important" onClick={onScan} disabled={scanRunning} variant="amber">
          <ScanIcon width={18} height={18} />
        </ActionBtn>
        <ActionBtn label="Rescan all" onClick={onRescanAll} disabled={scanRunning} variant="ghost">
          <RescanIcon width={16} height={16} />
        </ActionBtn>
        <ActionBtn label="Sync now" onClick={onSyncNow} disabled={scanRunning} variant="ghost">
          <SyncIcon width={16} height={16} />
        </ActionBtn>
      </div>

      {/* Divider */}
      <div className="my-3 h-px w-8" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1">
        <NavBtn label="Inbox" active={view === 'inbox'} onClick={() => onView('inbox')}>
          <InboxIcon />
        </NavBtn>
        <NavBtn label="Important" active={view === 'important'} onClick={() => onView('important')}>
          <ImportantIcon />
        </NavBtn>
        <NavBtn label="Starred" active={view === 'starred'} onClick={() => onView('starred')}>
          <StarIcon />
        </NavBtn>
      </nav>

      {/* Spacer pushes accounts + settings to the bottom */}
      <div className="flex-1" />

      {/* Account avatars */}
      <div className="flex flex-col items-center gap-2 mb-3">
        {/* "All accounts" selector */}
        <AccountAvatar
          label="All accounts"
          active={selectedAccount == null}
          onClick={() => onSelectAccount(null)}
          gradient
        />
        {accounts.map((a) => (
          <AccountAvatar
            key={a.id}
            color={a.color}
            label={a.email}
            active={selectedAccount === a.id}
            needsReauth={a.needs_reauth}
            onClick={() => onSelectAccount(a.id)}
          >
            {a.email.charAt(0).toUpperCase()}
          </AccountAvatar>
        ))}
      </div>

      {/* Settings pinned to bottom */}
      <NavBtn label="Settings" active={view === 'settings'} onClick={() => onView('settings')}>
        <SettingsIcon />
      </NavBtn>
    </aside>
  )
}

/** Square icon button used for the 3 primary actions. */
function ActionBtn({ children, label, onClick, disabled, variant }) {
  const base = 'h-9 w-9 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = variant === 'amber'
    ? 'text-[#0b0b12] hover:brightness-110'
    : 'text-white/70 hover:text-white border hover:bg-white/5'
  const bg = variant === 'amber' ? { background: '#f59e0b' } : undefined
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
      style={bg}
    >
      {children}
    </button>
  )
}

/** Nav icon button — wider hit area, purple active state. */
function NavBtn({ children, label, active, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
        active
          ? 'bg-white/10'
          : 'text-white/55 hover:text-white hover:bg-white/5'
      }`}
      style={active ? { color: '#7c6ef9' } : undefined}
    >
      {children}
    </button>
  )
}

/** Small colored circle for a connected account, with a matching glow ring. */
function AccountAvatar({ children, color, label, active, needsReauth, onClick, gradient }) {
  // The glow ring uses the account's own color so it reads as a brand signal.
  const glow = color || '#7c6ef9'
  const bg = gradient
    ? { background: 'linear-gradient(135deg, #7c6ef9, #1d9e75)' }
    : { background: `${glow}33`, color: glow }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-transform hover:scale-110 ${
        active ? 'ring-2 ring-white/70' : ''
      }`}
      style={{
        ...bg,
        boxShadow: `0 0 10px 1px ${glow}66, 0 0 0 1px ${glow}55`,
      }}
    >
      {children || (needsReauth ? '!' : '•')}
    </button>
  )
}
