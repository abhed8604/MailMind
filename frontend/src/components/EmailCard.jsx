import { relativeTime } from '../lib/categories'
import { companyForEmail, hexToRgba } from '../lib/company'
import { DotIcon } from './Icon'

/**
 * Panel 2 row — a liquid glass bubble.
 *
 * The bubble background is tinted by the ACCOUNT the email was received on
 * (mail1 → red, mail2 → blue, …) so each account reads as its own color band.
 *
 * When the email has been scanned (ai_summary available), the card shows:
 *   company name + timestamp → AI summary (2–4 lines)
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

  // The bubble background = the account color at low alpha (so glass still
  // refracts the orbs behind it). Falls back to neutral if no account.
  const accountTint = account?.color
    ? hexToRgba(account.color, 0.12)
    : 'rgba(255,255,255,0.035)'

  // ---- Processing placeholder (not yet scanned) -------------------------
  if (!scanned) {
    return (
      <button
        onClick={onClick}
        className={`group glass-bubble-processing w-full text-left px-4 py-3 transition-all duration-200 ${
          active ? 'glass-bubble-active' : ''
        }`}
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
            {unread && (
              <span className="ml-auto text-white" title="Unread"><DotIcon /></span>
            )}
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
          {/* Company name + timestamp */}
          <div className="flex items-baseline gap-2">
            <span className={`text-[14px] font-medium truncate ${unread ? 'text-sender' : 'text-white/55'}`}>
              {company}
            </span>
            <span className="ml-auto text-timestamp text-[11px] font-mono shrink-0">
              {relativeTime(email.date)}
            </span>
          </div>

          {/* AI-generated summary (2–4 lines), fallback to raw preview */}
          <p className="mt-1 text-[12.5px] leading-snug line-clamp-3 whitespace-pre-line text-preview">
            {aiSummary || fallback}
          </p>

          {/* Meta row: white unread dot + star */}
          <div className="flex items-center gap-2 mt-2">
            {unread && (
              <span className="text-white" title="Unread"><DotIcon /></span>
            )}
            {!unread && email.is_starred && (
              <span className="text-[#fbbf24] text-[10px]">★</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
