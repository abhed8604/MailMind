// Category metadata + helpers. Kept in sync with backend.llm_triage.VALID_CATEGORIES.
//
// All visual treatments here use rgba() on white or the brand palette so they
// read correctly over the dark panels. Skill §3.D: emoji is discouraged by
// default. Each category carries a Phosphor glyph component (rendered by the
// caller as `<cat.glyph .../>`) tinted to `cat.color`, instead of a colorful
// emoji. One icon family across the app (skill §3.C).
import {
  Warning, Clock, CurrencyDollar, At, Newspaper, Prohibit, Paperclip,
} from '@phosphor-icons/react'

export const CATEGORIES = {
  action_required: { glyph: Warning,       label: 'Action',     color: '#4ecf8e' },
  deadline:        { glyph: Clock,         label: 'Deadline',   color: '#f0a030' },
  financial:       { glyph: CurrencyDollar, label: 'Financial', color: '#4ecf8e' },
  personal:        { glyph: At,            label: 'Personal',   color: '#7eaaff' },
  newsletter:      { glyph: Newspaper,     label: 'Newsletter', color: '#7eaaff' },
  spam:            { glyph: Prohibit,      label: 'Spam',       color: '#f0a030' },
  other:           { glyph: Paperclip,     label: 'Other',      color: 'rgba(255,255,255,0.28)' },
}

// Per-category tint fills. Flat rgba() values, no gradients.
export const CATEGORY_TINTS = {
  action_required: 'rgba(78,207,142,0.10)',
  deadline:        'rgba(240,160,48,0.10)',
  financial:       'rgba(78,207,142,0.10)',
  personal:        'rgba(91,141,239,0.10)',
  newsletter:      'rgba(91,141,239,0.10)',
  spam:            'rgba(240,160,48,0.10)',
  other:           'rgba(255,255,255,0.04)',
}

export function categoryMeta(cat) {
  return CATEGORIES[cat] || CATEGORIES.other
}

export function categoryTint(cat) {
  return CATEGORY_TINTS[cat] || CATEGORY_TINTS.other
}

/**
 * Score → relevance chip style. Returns an inline-style object.
 * Three tiers per the design spec:
 *   80–100 → green  (#4ecf8e)
 *   40–79  → amber  (#f0a030)
 *   0–39   → grey   (rgba(255,255,255,0.28))
 * Scores are on a 0–100 scale.
 */
export function scoreBadgeStyle(score) {
  if (score == null) {
    return { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.28)' }
  }
  if (score >= 80) {
    return { background: 'rgba(30,200,120,0.15)', color: '#4ecf8e' }
  }
  if (score >= 40) {
    return { background: 'rgba(240,160,48,0.13)', color: '#f0a030' }
  }
  return { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.28)' }
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
