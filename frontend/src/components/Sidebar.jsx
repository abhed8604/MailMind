import { relativeTime } from '../lib/categories'

const NAV = [
  { id: 'inbox', label: 'Inbox', icon: '📥' },
  { id: 'important', label: 'Important', icon: '⚡' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

/**
 * Left rail: MailMind mark, primary nav, accounts list with color dots, and a
 * sync status pill at the bottom. Selecting an account filters the inbox to it.
 */
export default function Sidebar({
  view, onView, accounts, selectedAccount, onSelectAccount,
  syncStatus, mockMode,
}) {
  return (
    <aside className="w-60 shrink-0 bg-ink-950 border-r border-ink-800/70 flex flex-col">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-accent-amber/90 flex items-center justify-center text-ink-950 font-bold text-sm">M</div>
        <div className="font-semibold tracking-tight text-ink-100">MailMind</div>
      </div>

      {/* Nav */}
      <nav className="px-2 flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = view === n.id
          return (
            <button
              key={n.id}
              onClick={() => onView(n.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-ink-850 text-ink-100'
                  : 'text-ink-300 hover:bg-ink-900 hover:text-ink-200'
              }`}
            >
              <span className="text-[15px]">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Accounts */}
      <div className="mt-6 px-4 pb-1 text-[11px] uppercase tracking-wider text-ink-400">
        Accounts
      </div>
      <div className="px-2 flex-1 overflow-y-auto">
        <button
          onClick={() => onSelectAccount(null)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${
            selectedAccount == null ? 'bg-ink-850 text-ink-100' : 'text-ink-300 hover:bg-ink-900'
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-accent-blue to-accent-violet" />
          <span>All Accounts</span>
        </button>
        {accounts.map((a) => {
          const active = selectedAccount === a.id
          return (
            <button
              key={a.id}
              onClick={() => onSelectAccount(a.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm ${
                active ? 'bg-ink-850 text-ink-100' : 'text-ink-300 hover:bg-ink-900'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              <span className="truncate font-mono text-[13px]">{a.email}</span>
              {a.needs_reauth && <span className="ml-auto text-amber-400 text-xs" title="Needs re-auth">⚠</span>}
            </button>
          )
        })}
        {accounts.length === 0 && (
          <p className="px-3 py-2 text-xs text-ink-500">No accounts yet. Add one in Settings.</p>
        )}
      </div>

      {/* Sync status */}
      <div className="px-4 py-3 border-t border-ink-800/70 text-[11px] text-ink-400">
        {syncStatus.running ? (
          <span className="flex items-center gap-2 text-accent-blue">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
            Syncing…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
            {syncStatus.last_run ? `Synced ${relativeTime(syncStatus.last_run)}` : 'Idle'}
          </span>
        )}
        {mockMode && <div className="mt-1 text-amber-400/80">Demo mode (mock data)</div>}
      </div>
    </aside>
  )
}
