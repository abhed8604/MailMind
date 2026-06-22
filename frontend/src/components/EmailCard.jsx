import { relativeTime, scoreBadgeStyle } from '../lib/categories'
import { accountRamp, companyForEmail } from '../lib/company'
import { StarIcon } from './Icon'

/**
 * Email list row — flat card with two sub-rows and a bottom meta strip.
 *
 * TOP ROW — sender name (left) + account pill + timestamp (right):
 *   Unread: 12px font-weight 600, blue dot (6px #5B8DEF), primary text colour
 *   Read:   12px font-weight 400, no dot, dimmed text colour
 *
 * PREVIEW — 2-line clamp, 11px:
 *   Unread: preview colour
 *   Read:   faint colour
 *
 * BOTTOM ROW — relevance score chip (left) + star icon (right)
 *
 * ROW STATES:
 *   Unread: border-left 3px solid #5B8DEF
 *   Read:   border-left 3px solid transparent, no bg change
 *   Active: bg with account blue tint, border-left 3px solid #5B8DEF
 *   Hover:  subtle bg (if not active)
 */
export default function EmailCard({
  email, account, active, onClick, onToggleRead, onToggleStar,
  accountColorMap,
}) {
  const unread = !email.is_read
  const scanned = email.scanned_at != null || email.importance_score != null
  const fallback = email.preview || email.body_text || email.snippet || email.subject || ''
  const senderName = email.sender_name || companyForEmail(email.sender_email) || 'Unknown'
  // The pill shows the RECEIVING account (which inbox the mail landed in),
  // not the sender. Color follows the receiver account's color map entry.
  const receiverEmail = account?.email || ''
  const ramp = (accountColorMap && accountColorMap.get(email.account_id))
    || accountRamp(receiverEmail)
  const timestamp = relativeTime(email.date)
  const score = email.importance_score

  // Row-level border + background
  const rowBg = active
    ? 'rgba(91,141,239,0.12)'
    : unread
      ? 'rgba(91,141,239,0.05)'
      : 'transparent'
  const borderLeft = (active || unread)
    ? '3px solid #5B8DEF'
    : '3px solid transparent'
  const hoverBg = 'var(--surface-hover)'

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex flex-col min-w-0 overflow-hidden transition-colors"
      style={{
        padding: '9px 14px',
        background: rowBg,
        borderLeft,
        borderBottom: '0.5px solid var(--surface-hover)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = hoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = rowBg
      }}
    >
      {/* TOP ROW — sender (left) + timestamp + receiver-account pill (right) */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Unread blue dot */}
        {unread && <span className="unread-dot" />}

        {/* Sender name */}
        <span
          className="truncate"
          style={{
            fontSize: '12px',
            fontWeight: unread ? 600 : 400,
            color: unread ? 'var(--text-primary)' : 'var(--text-preview)',
          }}
        >
          {senderName}
        </span>

        {/* Timestamp */}
        <span className="ml-auto shrink-0" style={{ fontSize: '10px', color: 'var(--text-hint)' }}>
          {timestamp}
        </span>

        {/* Receiver account pill — shows the inbox that received this mail */}
        {receiverEmail && (
          <span
            className="truncate max-w-[110px]"
            style={{
              fontSize: '9px',
              fontWeight: 500,
              padding: '1px 5px',
              borderRadius: '999px',
              background: ramp.pillBg,
              color: ramp.color,
            }}
            title={`Received by ${receiverEmail}`}
          >
            {receiverEmail}
          </span>
        )}
      </div>

      {/* PREVIEW — full summary */}
      <div
        className="mt-0.5 overflow-hidden break-words"
        style={{
          fontSize: '11px',
          color: unread ? 'var(--text-muted)' : 'var(--text-faint)',
          lineHeight: '1.4',
        }}
      >
        {scanned ? (email.ai_summary || fallback) : (fallback || 'New email')}
      </div>

      {/* Processing indicator */}
      {!scanned && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="spinner" />
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Analyzing…
          </span>
        </div>
      )}

      {/* BOTTOM ROW — relevance score + star */}
      {scanned && (
        <div className="flex items-center justify-between mt-1">
          {/* Relevance score chip */}
          {score != null && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: '6px',
                ...scoreBadgeStyle(score),
              }}
            >
              relevance {score}
            </span>
          )}
          {score == null && <span />}

          {/* Star icon */}
          <span
            className="cursor-pointer"
            style={{ fontSize: '12px', color: email.is_starred ? '#f0a030' : 'var(--border-strong)' }}
            onClick={(ev) => { ev.stopPropagation(); onToggleStar?.(email) }}
            title={email.is_starred ? 'Unstar' : 'Star'}
          >
            <StarIcon width={12} height={12} filled={email.is_starred} />
          </span>
        </div>
      )}
    </button>
  )
}
