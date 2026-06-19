// ---------------------------------------------------------------------------
// Sender → display-name resolution for the email list.
//
// The list shows a "company" identifier per row, derived from the sender's
// email domain. Three tiers:
//
//   1. Freemail providers (gmail/yahoo/outlook/...) → the LOCAL part of the
//      address, because the domain is the provider, not the sender's identity.
//   2. Known brands → a curated display name (GitHub, not "Github").
//   3. Fallback → title-cased second-level domain (acmecorp.com → Acmecorp).
// ---------------------------------------------------------------------------

// Free webmail providers where the domain is the mailbox host, not a brand.
const FREEMAIL = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  'icloud.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
  'gmx.com', 'gmx.net', 'yandex.com', 'mail.com', 'zoho.com', 'fastmail.com',
])

// Brands whose display name differs from a naive reading of their domain.
// Keys are the resolved domain (after stripping mail subdomains).
const KNOWN = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'notion.so': 'Notion',
  'stripe.com': 'Stripe',
  'linkedin.com': 'LinkedIn',
  'google.com': 'Google',
  'substack.com': 'Substack',
  'coursera.org': 'Coursera',
  'netflix.com': 'Netflix',
  'apple.com': 'Apple',
  'amazon.com': 'Amazon',
  'aws.amazon.com': 'AWS',
  'slack.com': 'Slack',
  'figma.com': 'Figma',
  'vercel.com': 'Vercel',
  'medium.com': 'Medium',
  'dropbox.com': 'Dropbox',
  'paypal.com': 'PayPal',
  'zoom.us': 'Zoom',
  'calendly.com': 'Calendly',
  'mailchimp.com': 'Mailchimp',
  'linear.app': 'Linear',
  'docker.com': 'Docker',
  'openai.com': 'OpenAI',
  'anthropic.com': 'Anthropic',
  'huggingface.co': 'Hugging Face',
  'microsoft.com': 'Microsoft',
  'fb.com': 'Facebook',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'x.com': 'X',
  'twitter.com': 'Twitter',
  'reddit.com': 'Reddit',
  'discord.com': 'Discord',
  'spotify.com': 'Spotify',
  'airbnb.com': 'Airbnb',
  'uber.com': 'Uber',
  'lyft.com': 'Lyft',
  'ebay.com': 'eBay',
  'irs.gov': 'IRS',
}

// Subdomains that carry no brand information — strip before resolving.
const MAIL_SUBDOMAIN_PREFIXES = [
  'mail.', 'noreply.', 'no-reply.', 'notifications.', 'notification.',
  'noreport.', 'hello.', 'team.', 'support.', 'info.', 'news.', 'm.',
  'email.', 'alerts.', 'alert.', 'receipts.', 'service.', 'admin.',
]

/**
 * Lowercased, mail-subdomain-stripped domain from an email address.
 * 'm.learn.coursera.org' → 'coursera.org'
 * 'noreply@github.com'   → 'github.com'   (from 'noreply@github.com')
 * Returns '' for malformed input.
 */
export function domainFromEmail(addr) {
  if (!addr) return ''
  const at = addr.lastIndexOf('@')
  if (at < 0) return ''
  let domain = addr.slice(at + 1).toLowerCase().trim()
  // Iteratively strip known mail subdomains from the front.
  let changed = true
  while (changed) {
    changed = false
    for (const p of MAIL_SUBDOMAIN_PREFIXES) {
      if (domain.startsWith(p)) {
        domain = domain.slice(p.length)
        changed = true
        break
      }
    }
  }
  return domain
}

/**
 * Resolve a sender email to a short display name for the inbox row.
 *
 *   'sarah.chen@acmecorp.com'   → 'Acmecorp'      (title-cased SLD)
 *   'noreply@github.com'        → 'GitHub'         (known brand)
 *   'abhed8604@gmail.com'       → 'abhed8604'      (freemail → local part)
 *   'm.learn@coursera.org'      → 'Coursera'       (subdomain stripped)
 *   null / '' / 'garbage'       → 'Unknown'
 */
export function companyForEmail(addr) {
  if (!addr) return 'Unknown'
  const at = addr.lastIndexOf('@')
  if (at < 0) return 'Unknown'

  const local = addr.slice(0, at).trim()
  const domain = domainFromEmail(addr)
  if (!domain) return local || 'Unknown'

  // 1. Freemail → local part (the person, not the provider).
  if (FREEMAIL.has(domain)) {
    return local || 'Unknown'
  }

  // 2. Known brand (try full domain, then parent domain for subbrands like
  //    aws.amazon.com → also check amazon.com as a secondary key).
  if (KNOWN[domain]) return KNOWN[domain]
  const firstDot = domain.indexOf('.')
  if (firstDot >= 0) {
    const parent = domain.slice(firstDot + 1)
    if (parent && KNOWN[parent]) return KNOWN[parent]
  }

  // 3. Fallback → title-cased second-level domain.
  //    'acmecorp.com' → 'Acmecorp', 'drpatel.com' → 'Drpatel'.
  const sld = firstDot >= 0 ? domain.slice(0, firstDot) : domain
  if (!sld) return local || 'Unknown'
  return sld.charAt(0).toUpperCase() + sld.slice(1)
}

/**
 * Apply an alpha channel to a hex color. Returns an `#RRGGBBAA` string.
 *   withAlpha('#60a5fa', 0.06) → '#60a5fa0f'
 * Accepts shorthand (#abc) and 6-digit (#aabbcc) inputs.
 */
export function withAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return null
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (h.length !== 6) return null
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16).padStart(2, '0')
  return `#${h}${a}`
}

/**
 * Convert a hex color to an `rgba(r, g, b, a)` string for use as a CSS
 * background tint. Accepts shorthand (#abc) and 6-digit (#aabbcc) inputs.
 *   hexToRgba('#60a5fa', 0.12) → 'rgba(96,165,250,0.12)'
 */
export function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(255,255,255,${alpha})`
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r},${g},${b},${a})`
}

// ---------------------------------------------------------------------------
// Account color system.
//
// Five color ramps for account pills, assigned per-account consistently
// across list rows, reading pane badges, and the sidebar:
//
//   Primary Gmail    → blue    (#7eaaff) — rgba(91,141,239,0.18)
//   Secondary Gmail  → purple  (#c084fc) — rgba(168,85,247,0.18)
//   College (.ac.in)→ green   (#4ecf8e) — rgba(78,207,142,0.15)
//   Work / corporate → amber   (#f0a030) — rgba(240,160,48,0.15)
//   Other / misc     → grey    (rgba(255,255,255,0.55))
// ---------------------------------------------------------------------------

// Color ramp definitions: { label, color (text), pillBg }
const ACCOUNT_RAMPS = {
  blue:    { label: 'blue',    color: '#7eaaff',                   pillBg: 'rgba(91,141,239,0.18)' },
  purple:  { label: 'purple',  color: '#c084fc',                   pillBg: 'rgba(168,85,247,0.18)' },
  green:   { label: 'green',   color: '#4ecf8e',                   pillBg: 'rgba(78,207,142,0.15)' },
  amber:   { label: 'amber',   color: '#f0a030',                   pillBg: 'rgba(240,160,48,0.15)' },
  grey:    { label: 'grey',    color: 'rgba(255,255,255,0.55)',   pillBg: 'rgba(255,255,255,0.10)' },
}

const COLOR_CYCLE = ['blue', 'purple', 'green', 'amber', 'grey']

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  'icloud.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
  'gmx.com', 'gmx.net', 'yandex.com', 'mail.com', 'zoho.com', 'fastmail.com',
])

/**
 * Classify an email domain into one of: 'college' | 'gmail' | 'freemail' | 'custom'.
 *   gmail.com          → 'gmail'
 *   other freemail     → 'freemail'
 *   .ac.in / .edu      → 'college'
 *   everything else    → 'custom'
 */
function domainCategory(emailAddr) {
  const domain = domainFromEmail(emailAddr)
  if (!domain) return 'custom'
  if (domain.endsWith('.ac.in') || domain.endsWith('.edu')
      || domain.endsWith('.edu.in') || domain.endsWith('.ac.uk')) {
    return 'college'
  }
  if (domain === 'gmail.com') return 'gmail'
  if (FREEMAIL_DOMAINS.has(domain)) return 'freemail'
  return 'custom'
}

/**
 * Resolve an account email address to its color ramp.
 *
 * For sender emails (used in the reading pane badge), always returns:
 *   gmail.com          → blue
 *   .ac.in / .edu      → green
 *   other freemail     → grey
 *   custom domain      → amber
 *
 * Returns the ramp object { label, color, pillBg }.
 */
export function accountRamp(emailAddr) {
  const cat = domainCategory(emailAddr)
  if (cat === 'college') return ACCOUNT_RAMPS.green
  if (cat === 'gmail')   return ACCOUNT_RAMPS.blue
  if (cat === 'freemail') return ACCOUNT_RAMPS.grey
  return ACCOUNT_RAMPS.amber
}

/**
 * Build a consistent color map for a list of accounts.
 * Returns a Map<accountId, { color, pillBg }>.
 *
 * Assignment rules:
 *   @gmail.com (first/only)   → blue
 *   @gmail.com (second+)      → purple
 *   @*.ac.in / @*.edu         → green
 *   corporate/custom domain    → amber
 *   other freemail / misc      → grey
 *   6+ accounts → cycle blue → purple → green → amber → grey → blue…
 */
export function buildAccountColorMap(accounts) {
  const map = new Map()
  let gmailIndex = 0
  const usedColors = new Set()

  for (const acct of accounts) {
    const cat = domainCategory(acct.email)

    let rampKey
    if (cat === 'college') {
      rampKey = 'green'
    } else if (cat === 'gmail') {
      rampKey = gmailIndex === 0 ? 'blue' : 'purple'
      gmailIndex++
    } else if (cat === 'freemail') {
      rampKey = 'grey'
    } else {
      rampKey = 'amber'
    }

    // If this color was already taken (e.g. two college accounts), cycle
    if (usedColors.has(rampKey)) {
      for (const c of COLOR_CYCLE) {
        if (!usedColors.has(c)) { rampKey = c; break }
      }
    }

    usedColors.add(rampKey)
    map.set(acct.id, ACCOUNT_RAMPS[rampKey])
  }

  return map
}
