import { relativeTime } from '../lib/categories'
import TriageBadge from './TriageBadge'

/**
 * Single row in the inbox. Important emails get an amber left-border accent
 * (per spec); unread emails render with a brighter subject + an unread dot.
 */
export default function EmailCard({ email, account, active, onClick, onToggleRead, onToggleStar }) {
  const unread = !email.is_read
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left flex gap-3 px-4 py-3 border-b border-ink-800/60 transition-colors relative ${
        active ? 'bg-ink-850' : 'hover:bg-ink-900'
      }`}
    >
      {/* Importance accent border */}
      {email.important && (
        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent-amber" />
      )}

      {/* Avatar / unread dot */}
      <div className="pt-1 w-5 flex justify-center">
        {unread ? (
          <span className="h-2 w-2 rounded-full bg-accent-blue" />
        ) : (
          email.is_starred && <span className="text-amber-400 text-xs">★</span>
        )}
      </div>

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-[13px] truncate ${unread ? 'text-ink-100' : 'text-ink-300'}`}>
            {email.sender_name || email.sender_email || 'Unknown'}
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-400 shrink-0">
            {relativeTime(email.date)}
          </span>
        </div>
        <div className={`text-sm truncate mt-0.5 ${unread ? 'text-ink-100 font-medium' : 'text-ink-300'}`}>
          {email.subject || '(no subject)'}
        </div>
        <div className="text-[13px] text-ink-400 truncate mt-0.5">{email.snippet}</div>

        <div className="flex items-center gap-2 mt-1.5">
          {account && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono"
              style={{ background: `${account.color}22`, color: account.color }}
            >
              {account.email}
            </span>
          )}
          <TriageBadge email={email} compact />
          {email.importance_reason && email.important && (
            <span className="text-[11px] text-ink-400 truncate italic hidden md:inline">
              {email.importance_reason}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
        <IconBtn title={unread ? 'Mark read' : 'Mark unread'} onClick={() => onToggleRead?.(email)}>
          {unread ? '✓' : '●'}
        </IconBtn>
        <IconBtn title="Star" onClick={() => onToggleStar?.(email)}>
          <span className={email.is_starred ? 'text-amber-400' : ''}>★</span>
        </IconBtn>
      </div>
    </button>
  )
}

function IconBtn({ children, onClick, title }) {
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick?.(e) }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClick?.(e) } }}
      className="h-6 w-6 flex items-center justify-center rounded text-ink-400 hover:text-ink-100 hover:bg-ink-800 text-xs cursor-pointer"
    >
      {children}
    </span>
  )
}
