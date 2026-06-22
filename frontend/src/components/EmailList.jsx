import { useEffect, useMemo, useRef } from 'react'
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

function range(start, end) {
  return Array.from({ length: end - start }, (_, i) => start + i)
}

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
  accountColorMap,
  onOpenMenu,
  onRefresh,
  onScrollCapture,
  savedScroll,
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

  // Local ref to the scroll container, so we can both restore the saved
  // scroll position on mount and capture the current position on scroll
  // (forwarded to the parent so it survives the unmount that happens on
  // mobile when the reader opens).
  const scrollContainerRef = useRef(null)
  useEffect(() => {
    const node = scrollContainerRef.current
    if (node && savedScroll && savedScroll.current > 0) {
      node.scrollTop = savedScroll.current
    }
  }, [savedScroll])

  return (
    <div
      className="h-full flex flex-col min-w-0"
      style={{ background: 'var(--bg-list)', ...style }}
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
          <h1 className="text-[14px] font-medium truncate" style={{ color: 'var(--text-label)' }}>
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
                color: active ? '#7eaaff' : 'var(--text-dim)',
                background: active ? 'rgba(91,141,239,0.15)' : 'transparent',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Divider below tabs */}
      <div style={{ borderTop: '0.5px solid var(--border-subtle)' }} />

      {/* Scrollable email list — re-mounts on filter change to trigger animation */}
      <div
        key={filter}
        ref={(node) => { scrollContainerRef.current = node; listRefCallback(node) }}
        onScroll={(e) => { if (onScrollCapture) onScrollCapture(e.currentTarget.scrollTop) }}
        className="flex-1 overflow-y-auto email-list-enter"
        style={{ position: 'relative' }}
      >
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
              accountColorMap={accountColorMap}
            />
          ))
        )}
      </div>

      {/* Pagination footer */}
      <div
        className="px-3.5 py-2 text-center mm-list-footer"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        {data.total > 0 ? (
          <span className="text-[10px]" style={{ color: 'var(--text-preview)' }}>
            {(data.page - 1) * PAGE_SIZE + 1}-{Math.min(data.page * PAGE_SIZE, data.total)} of {data.total}
          </span>
        ) : (
          <span className="text-[10px]" style={{ color: 'var(--text-preview)' }}>0 emails</span>
        )}
        {data.total_pages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
            {range(1, data.total_pages + 1).map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className="rounded-md transition-colors"
                style={{
                  minWidth: 22,
                  height: 22,
                  fontSize: '10px',
                  fontWeight: p === page ? 600 : 400,
                  color: p === page ? '#7eaaff' : 'var(--text-dim)',
                  background: p === page ? 'rgba(91,141,239,0.15)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                }}
                onMouseEnter={(e) => { if (p !== page) e.currentTarget.style.color = 'var(--text-label)' }}
                onMouseLeave={(e) => { if (p !== page) e.currentTarget.style.color = 'var(--text-dim)' }}
              >
                {p}
              </button>
            ))}
          </div>
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
        background: 'var(--surface-fill)',
        border: '0.5px solid var(--border-strong)',
        padding: '6px 10px',
      }}
    >
      <span className="mr-2 shrink-0" style={{ color: 'var(--text-hint)' }}>
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search mail..."
        className="bg-transparent flex-1 min-w-0 text-[12px] focus:outline-none mm-search-input"
        style={{
          color: 'var(--text-label)',
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
          style={{ height: 72, borderBottom: '0.5px solid var(--surface-hover)', padding: '9px 14px' }}
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
    <div className="p-6 text-center text-[12px]" style={{ color: 'var(--text-hint)' }}>
      {reason}
    </div>
  )
}

export { PAGE_SIZE }
