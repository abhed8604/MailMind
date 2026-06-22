import { useMemo } from 'react'
import EmailCard from './EmailCard'
import { SearchIcon, LogoMark, MenuIcon } from './Icon'
import { usePullToRefresh } from '../hooks/usePullToRefresh'

const FILTERS = [
  { id: 'important', label: 'Important' },
  { id: 'unread', label: 'Unread' },
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
]

const PAGE_SIZE = 50

const VIEW_TITLES = {
  inbox: 'Inbox',
  important: 'Important',
  starred: 'Starred',
}

/**
 * Panel 2 — mail list (fixed 272px wide).
 *
 * Header: title + search bar + filter pills.
 * Body: scrollable email rows.
 * Footer: pagination text.
 */
export default function EmailList({
  filter, onFilter, query, onQuery,
  data, loading, error,
  accounts,
  selectedEmailId, onSelectEmail, onToggleRead, onToggleStar,
  page, onPageChange,
  view,
  style,
  amoled,
  accountColorMap,
  onOpenMenu,
  onRefresh,
}) {
  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts],
  )

  // Pull-to-refresh on the email list scroll container.
  // usePullToRefresh returns a refCallback we attach to the scroll element;
  // it holds the node in state so listeners re-attach after `key={filter}`
  // remounts the div on every tab switch.
  const { pullDist, refCallback: listRefCallback } = usePullToRefresh({ onRefresh, threshold: 60 })

  return (
    <div
      className="h-full flex flex-col min-w-0"
      style={{ background: amoled ? '#000000' : '#16162a', ...style }}
    >
      {/* Header: brand wordmark (mobile only) + title + search */}
      <div className="mm-mobile-brand">
        <LogoMark width={20} height={20} />
        <span className="mm-brand-name">MailMind</span>
      </div>
      <div className="px-3.5 pt-3 pb-2.5">
        <div className="flex items-center gap-2 mb-2 min-w-0">
          {/* Mobile hamburger — inline next to the title (hidden on desktop) */}
          {onOpenMenu && (
            <button
              type="button"
              className="mm-list-hamburger shrink-0"
              aria-label="Open menu"
              title="Open menu"
              onClick={onOpenMenu}
            >
              <MenuIcon width={18} height={18} />
            </button>
          )}
          <h1 className="text-[14px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.80)' }}>
            {VIEW_TITLES[view] || 'Inbox'}
          </h1>
        </div>
        <SearchBar value={query} onChange={onQuery} />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 px-3.5 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => onFilter(f.id)}
              className="px-2.5 py-1 rounded-full transition-colors"
              style={{
                fontSize: '11px',
                color: active ? '#7eaaff' : 'rgba(255,255,255,0.32)',
                background: active ? 'rgba(91,141,239,0.15)' : 'transparent',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Divider below tabs */}
      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)' }} />

      {/* Scrollable email list — re-mounts on filter change to trigger animation */}
      <div key={filter} ref={listRefCallback} className="flex-1 overflow-y-auto email-list-enter" style={{ position: 'relative' }}>
        {/* Pull-to-refresh spinner */}
        {pullDist > 0 && (
          <div
            className="flex items-center justify-center"
            style={{
              height: Math.min(pullDist, 70),
              opacity: Math.min(pullDist / 40, 1),
              transition: pullDist === 0 ? 'height 0.2s' : 'none',
            }}
          >
            <span className="spinner" />
          </div>
        )}
        {error && (
          <div
            className="mx-2 mt-2 px-3 py-2 text-[12px] rounded-lg"
            style={{ color: '#fca5a5', background: 'rgba(248,113,113,0.08)' }}
          >
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
              amoled={amoled}
              accountColorMap={accountColorMap}
            />
          ))
        )}
      </div>

      {/* Pagination footer */}
      <div
        className="px-3.5 py-2 text-center mm-list-footer"
        style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}
      >
        {data.total > 0 ? (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.40)' }}>
            {(data.page - 1) * PAGE_SIZE + 1}-{Math.min(data.page * PAGE_SIZE, data.total)} of {data.total}
            {data.total_pages > 1 && (
              <> · <button
                onClick={() => onPageChange(Math.min(page + 1, data.total_pages))}
                disabled={page >= data.total_pages}
                className="underline disabled:opacity-30"
                style={{ color: 'rgba(255,255,255,0.40)' }}
              >next</button></>
            )}
          </span>
        ) : (
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.40)' }}>0 emails</span>
        )}
      </div>
    </div>
  )
}

/** Search bar — flat, no glass. */
function SearchBar({ value, onChange }) {
  return (
    <div
      className="flex items-center rounded-lg min-w-0"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '0.5px solid rgba(255,255,255,0.09)',
        padding: '6px 10px',
      }}
    >
      <span className="mr-2 shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail..."
        className="bg-transparent flex-1 min-w-0 text-[12px] focus:outline-none mm-search-input"
        style={{
          color: 'rgba(255,255,255,0.80)',
          minWidth: 0,
        }}
      />
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 72, borderBottom: '0.5px solid rgba(255,255,255,0.04)', padding: '9px 14px' }}
        />
      ))}
    </div>
  )
}

function EmptyState({ query, filter }) {
  const reason = query
    ? `No emails match "${query}".`
    : filter === 'unread'
      ? 'No unread emails. You\'re all caught up.'
      : filter === 'important'
        ? 'No important emails yet. Run a scan to find them.'
        : filter === 'starred'
          ? 'No starred emails.'
          : 'This inbox is empty.'
  return (
    <div className="p-6 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
      {reason}
    </div>
  )
}

export { PAGE_SIZE }
