import { useMemo } from 'react'
import EmailCard from './EmailCard'
import SearchBar from './SearchBar'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'important', label: 'Important' },
  { id: 'starred', label: 'Starred' },
]

const PAGE_SIZE = 50

/**
 * Inbox column: filter tabs + search + the scrollable email list with skeleton
 * loaders and prev/next pagination. Calls back up for selection + state toggles.
 */
export default function EmailList({
  filter, onFilter, query, onQuery,
  data, loading, error,
  accounts, selectedAccount,
  selectedEmailId, onSelectEmail, onToggleRead, onToggleStar,
  page, onPageChange,
}) {
  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts],
  )

  return (
    <div className="w-full md:w-[420px] shrink-0 border-r border-ink-800/60 flex flex-col bg-ink-950">
      {/* Search */}
      <div className="p-3 border-b border-ink-800/60">
        <SearchBar value={query} onChange={onQuery} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-ink-800/60">
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => onFilter(f.id)}
              className={`px-3 py-1 rounded-md text-[13px] transition-colors ${
                active ? 'bg-ink-850 text-ink-100' : 'text-ink-400 hover:text-ink-200 hover:bg-ink-900'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 text-sm text-red-300 bg-red-500/5 border-b border-red-500/20">
            {error}
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : data.emails.length === 0 ? (
          <EmptyState query={query} filter={filter} />
        ) : (
          data.emails.map((e) => (
            <EmailCard
              key={e.id}
              email={e}
              account={accountsById[e.account_id]}
              active={e.id === selectedEmailId}
              onClick={() => onSelectEmail(e)}
              onToggleRead={onToggleRead}
              onToggleStar={onToggleStar}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {data.total_pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-ink-800/60 text-[12px] text-ink-400">
          <span className="font-mono">
            {data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(data.page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="disabled:opacity-30 hover:text-ink-200">‹ Prev</button>
            <span className="font-mono">{data.page} / {data.total_pages}</span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= data.total_pages} className="disabled:opacity-30 hover:text-ink-200">Next ›</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Pagination handler is wired by the parent via the `onPageChange` prop.

function SkeletonRows() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-6 py-3.5 border-b border-ink-800/60">
          <div className="flex gap-3">
            <div className="h-2 w-2 mt-2 rounded-full skeleton" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded skeleton" />
              <div className="h-3 w-2/3 rounded skeleton" />
              <div className="h-2.5 w-1/2 rounded skeleton" />
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
      ? 'No unread emails. You’re all caught up. 🎉'
      : filter === 'important'
        ? 'No important emails yet. Run a triage scan to find them.'
        : filter === 'starred'
          ? 'No starred emails.'
          : 'This inbox is empty.'
  return (
    <div className="p-8 text-center text-ink-400 text-sm">
      <div className="text-3xl mb-2 opacity-50">📭</div>
      {reason}
    </div>
  )
}

export { PAGE_SIZE }
