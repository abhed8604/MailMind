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
