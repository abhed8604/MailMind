import { useMemo } from 'react'
import EmailCard from './EmailCard'
import { SearchIcon } from './Icon'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'important', label: 'Important' },
  { id: 'starred', label: 'Starred' },
]

const PAGE_SIZE = 50

const VIEW_TITLES = {
  inbox: 'Inbox',
  important: 'Important',
  starred: 'Starred',
}

/**
 * Panel 2 — mail list.
 *
 * Top: section title + a frosted glass search bar.
 * Below: filter tabs as pill toggles.
 * Body: scrollable column of liquid glass bubbles (EmailCard).
 *
 * Width is controlled by the parent PanelGroup; this component fills its panel.
 */
export default function EmailList({
  filter, onFilter, query, onQuery,
  data, loading, error,
  accounts,
  selectedEmailId, onSelectEmail, onToggleRead, onToggleStar,
  page, onPageChange,
  view,
}) {
  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts],
  )

  return (
    <div
      className="min-w-0 h-full w-full flex flex-col"
      style={{ borderRight: '0.5px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header: title + frosted search */}
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-primary text-[17px] font-medium mb-3">
          {VIEW_TITLES[view] || 'Inbox'}
        </h1>
        <SearchBar value={query} onChange={onQuery} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 px-5 pb-3">
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => onFilter(f.id)}
              className={`px-3 py-1 rounded-full text-[12px] transition-colors ${
                active
                  ? 'text-white'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
              style={active ? { background: 'rgba(124,110,249,0.25)', color: '#7c6ef9' } : undefined}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {error && (
          <div className="m-2 px-3 py-2 text-[13px] rounded-xl"
            style={{ color: '#fca5a5', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : data.emails.length === 0 ? (
          <EmptyState query={query} filter={filter} />
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {data.emails.map((e) => (
              <EmailCard
                key={e.id}
                email={e}
                account={accountsById[e.account_id]}
                active={e.id === selectedEmailId}
                onClick={() => onSelectEmail(e)}
                onToggleRead={onToggleRead}
                onToggleStar={onToggleStar}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div
          className="flex items-center justify-between px-5 py-2 text-[12px] text-timestamp"
          style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
        >
          <span className="font-mono">
            {data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(data.page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-3">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="disabled:opacity-30 hover:text-white/80">‹ Prev</button>
            <span className="font-mono">{data.page} / {data.total_pages}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= data.total_pages} className="disabled:opacity-30 hover:text-white/80">Next ›</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Frosted glass search input. */
function SearchBar({ value, onChange }) {
  return (
    <div
      className="relative flex items-center glass-subtle rounded-full px-3.5 py-2"
      style={{ border: '0.5px solid rgba(255,255,255,0.08)' }}
    >
      <span className="text-white/40 mr-2"><SearchIcon /></span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail…"
        className="bg-transparent flex-1 text-[13px] text-primary placeholder:text-white/30 focus:outline-none"
      />
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2 pt-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass-bubble px-4 py-3.5" style={{ minHeight: 92 }}>
          <div className="flex gap-3 relative" style={{ zIndex: 1 }}>
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded-full skeleton" />
              <div className="h-3 w-2/3 rounded-full skeleton" />
              <div className="h-2.5 w-1/2 rounded-full skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ query, filter }) {
  const reason = query
    ? `No emails match “${query}”.`
    : filter === 'unread'
      ? 'No unread emails. You’re all caught up.'
      : filter === 'important'
        ? 'No important emails yet. Run a scan to find them.'
        : filter === 'starred'
          ? 'No starred emails.'
          : 'This inbox is empty.'
  return (
    <div className="p-10 text-center text-white/30 text-[13px]">
      <div className="text-3xl mb-3 opacity-30">✉️</div>
      {reason}
    </div>
  )
}

export { PAGE_SIZE }
