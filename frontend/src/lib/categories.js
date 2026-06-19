// Category metadata + helpers. Kept in sync with backend.llm_triage.VALID_CATEGORIES.
//
// All visual treatments here use rgba() on white or the brand palette so they
// read correctly over the glass surfaces and ambient orbs.

export const CATEGORIES = {
  action_required: { emoji: '🔴', label: 'Action',     color: '#f87171' },
  deadline:        { emoji: '⏰', label: 'Deadline',    color: '#fbbf24' },
  financial:       { emoji: '💰', label: 'Financial',   color: '#34d399' },
  personal:        { emoji: '✉️', label: 'Personal',    color: '#60a5fa' },
  newsletter:      { emoji: '📰', label: 'Newsletter',  color: '#a78bfa' },
  spam:            { emoji: '🚫', label: 'Spam',        color: '#fb7185' },
  other:           { emoji: '📎', label: 'Other',       color: '#94a3b8' },
}

// Per-category tint fills for the glass bubbles, per the design spec.
// (Exact rgba values from the brief.)
export const CATEGORY_TINTS = {
  action_required: 'rgba(248,113,113,0.13)',
  deadline:        'rgba(239,159,39,0.11)',
  financial:       'rgba(29,158,117,0.12)',
  personal:        'rgba(96,165,250,0.12)',
  newsletter:      'rgba(124,110,249,0.13)',
  spam:            'rgba(244,114,182,0.12)',
  other:           'rgba(255,255,255,0.04)',
}

export function categoryMeta(cat) {
  return CATEGORIES[cat] || CATEGORIES.other
}

export function categoryTint(cat) {
  return CATEGORY_TINTS[cat] || CATEGORY_TINTS.other
}

/**
 * Score → small badge style. Returns an inline-style object so it composes
 * cleanly over glass. High scores lean amber; mid scores purple (brand).
 */
export function scoreBadgeStyle(score) {
  if (score == null) {
    return { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '0.5px solid rgba(255,255,255,0.08)' }
  }
  if (score >= 8) {
    return { background: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: '0.5px solid rgba(245,158,11,0.4)' }
  }
  if (score >= 6) {
    return { background: 'rgba(124,110,249,0.18)', color: '#a78bfa', border: '0.5px solid rgba(124,110,249,0.4)' }
  }
  if (score >= 3) {
    return { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '0.5px solid rgba(255,255,255,0.08)' }
  }
  return { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', border: '0.5px solid rgba(255,255,255,0.06)' }
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
