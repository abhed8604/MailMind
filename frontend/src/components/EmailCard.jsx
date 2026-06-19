import { relativeTime, scoreBadgeStyle } from '../lib/categories'
import { companyForEmail, hexToRgba } from '../lib/company'

/**
 * Panel 2 row — a liquid glass bubble.
 *
 * The bubble background is tinted by the ACCOUNT the email was received on
 * (mail1 → red, mail2 → blue, …) so each account reads as its own color band.
 *
 * Read vs unread is conveyed by tint strength rather than a dot: unread mails
 * use a brighter tint so they pop out, read mails use a dimmer tint and recede.
 *
 * When the email has been scanned, the right edge carries a numeric importance
 * score badge (color-coded by tier).
 *
 * When the email has NOT been scanned yet, it renders a darker "processing"
 * placeholder with a shimmer spinner, signalling the AI is still working on it.
 */
export default function EmailCard({ email, account, active, onClick, onToggleRead, onToggleStar }) {
  const unread = !email.is_read
  const company = companyForEmail(email.sender_email || email.sender_name)
  const aiSummary = email.ai_summary
  const scanned = email.scanned_at != null || email.importance_score != null
  const fallback = email.preview || email.body_text || email.snippet || ''

  // The bubble background = the account color. Unread mails get a brighter
  // tint (pop out), read mails get a dimmer tint (recede). Falls back to
  // neutral if no account.
  const accountTint = account?.color
    ? hexToRgba(account.color, unread ? 0.18 : 0.05)
    : (unread ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)')

  // ---- Processing placeholder (not yet scanned) -------------------------
  if (!scanned) {
    return (
      <button
        onClick={onClick}
        className={`group glass-bubble-processing w-full text-left px-4 py-3 transition-all duration-200 ${
          active ? 'glass-bubble-active' : ''
        }`}
        style={{
          background: unread ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)',
        }}
      >
        <div className="relative flex flex-col gap-1.5" style={{ zIndex: 1 }}>
          {/* Company name + timestamp */}
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium truncate text-white/55">
              {company}
            </span>
            <span className="ml-auto text-timestamp text-[11px] font-mono shrink-0">
              {relativeTime(email.date)}
            </span>
          </div>

          {/* Blurred body preview to hint at content */}
          <div className="blurred-body text-[12.5px] leading-snug line-clamp-2">
            {fallback || email.subject || 'New email'}
          </div>

          {/* Processing indicator */}
          <div className="flex items-center gap-2 mt-1">
            <span className="spinner" />
            <span className="text-[10px] text-white/35 tracking-wide uppercase">Analyzing…</span>
          </div>
        </div>
      </button>
    )
  }

  // ---- Scanned card with AI summary --------------------------------------
  return (
    <button
      onClick={onClick}
      className={`group glass-bubble w-full text-left px-4 py-3 transition-all duration-200 ${
        active ? 'glass-bubble-active' : ''
      }`}
      style={{
        background: accountTint,
      }}
    >
      {/* Content sits above the ::before specular highlight. */}
      <div className="relative flex gap-3" style={{ zIndex: 1 }}>
        {/* Main column */}
        <div className="flex-1 min-w-0">
          {/* Company name */}
          <span className={`block text-[14px] font-medium truncate ${unread ? 'text-sender' : 'text-white/45'}`}>
            {company}
          </span>

          {/* AI-generated summary (2–4 lines), fallback to raw preview */}
          <p className={`mt-1 text-[12.5px] leading-snug line-clamp-3 whitespace-pre-line ${unread ? 'text-preview' : 'text-white/20'}`}>
            {aiSummary || fallback}
          </p>

          {/* Meta row: star indicator for starred read emails */}
          {email.is_starred && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[#fbbf24] text-[10px]">★</span>
            </div>
          )}
        </div>

        {/* Right column: received time on top, importance score below */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-timestamp text-[11px] font-mono">
            {relativeTime(email.date)}
          </span>
          {email.importance_score != null && (
            <span
              className="inline-flex items-center justify-center min-w-[34px] rounded-md px-1.5 py-1 text-[11px] font-mono font-semibold tabular-nums"
              style={scoreBadgeStyle(email.importance_score)}
              title={`Importance score: ${email.importance_score}`}
            >
              {email.importance_score}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
