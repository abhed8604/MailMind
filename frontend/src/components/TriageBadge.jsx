import { categoryMeta, scoreBadgeStyle } from '../lib/categories'

/**
 * Two-part badge: a category chip (emoji + label) and, for important emails,
 * a numeric score chip. Only renders what exists on the email. Styles use
 * rgba inline values so they compose over the glass bubble surfaces.
 */
export default function TriageBadge({ email, compact = false }) {
  const hasTriage = email.scanned_at != null
  if (!hasTriage && email.importance_score == null) return null

  const cat = categoryMeta(email.category)
  const showScore = email.important || email.importance_score != null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {email.category && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: `${cat.color}1f`,
            color: cat.color,
            border: `0.5px solid ${cat.color}55`,
          }}
        >
          <span>{cat.emoji}</span>
          {!compact && <span>{cat.label}</span>}
        </span>
      )}
      {showScore && (
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums"
          style={scoreBadgeStyle(email.importance_score)}
        >
          {email.importance_score}
        </span>
      )}
    </div>
  )
}
