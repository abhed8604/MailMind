// Maps the LLM's category strings to UI badges (emoji + label + tailwind color).
// Kept in sync with backend.llm_triage.VALID_CATEGORIES.

export const CATEGORIES = {
  action_required: { emoji: '🔴', label: 'Action Required', text: 'text-red-300', bg: 'bg-red-500/10', ring: 'border-red-500/30' },
  deadline:        { emoji: '⏰', label: 'Deadline',         text: 'text-amber-300', bg: 'bg-amber-500/10', ring: 'border-amber-500/30' },
  financial:       { emoji: '💰', label: 'Financial',        text: 'text-emerald-300', bg: 'bg-emerald-500/10', ring: 'border-emerald-500/30' },
  personal:        { emoji: '✉️', label: 'Personal',         text: 'text-sky-300', bg: 'bg-sky-500/10', ring: 'border-sky-500/30' },
  newsletter:      { emoji: '📰', label: 'Newsletter',       text: 'text-violet-300', bg: 'bg-violet-500/10', ring: 'border-violet-500/30' },
  spam:            { emoji: '🚫', label: 'Spam',             text: 'text-rose-300', bg: 'bg-rose-500/10', ring: 'border-rose-500/30' },
  other:           { emoji: '📎', label: 'Other',            text: 'text-ink-300', bg: 'bg-ink-800', ring: 'border-ink-700' },
}

export function categoryMeta(cat) {
  return CATEGORIES[cat] || CATEGORIES.other
}

// Score → badge color. High scores get the amber accent per spec.
export function scoreBadgeClass(score) {
  if (score == null) return 'text-ink-400 bg-ink-800 border border-ink-700'
  if (score >= 8) return 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
  if (score >= 6) return 'text-amber-200/80 bg-amber-500/10 border border-amber-500/30'
  if (score >= 3) return 'text-ink-300 bg-ink-800 border border-ink-700'
  return 'text-ink-400 bg-ink-850 border border-ink-700'
}

// Relative time like "2h ago" / "3d ago".
export function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}
