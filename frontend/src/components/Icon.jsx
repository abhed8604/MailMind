/**
 * Inline SVG icon set — single source of truth for all icons.
 * All drawn on a 24x24 viewBox with a 1.5px stroke (round caps/joins),
 * `stroke="currentColor"` so color is inherited from the parent's text color.
 * No external dependency, fully tree-shakeable via the named exports.
 */
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function ScanIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      {/* lightning bolt — the "scan / triage" mark */}
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </svg>
  )
}

/** Circular refresh — used for "Rescan all" (distinct from the arrows). */
export function RescanIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M21 12a9 9 0 1 1-3.5-7.1" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

/** Up/down arrows — used for "Sync now" (fetch new mail). */
export function SyncIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  )
}

/** MailMind wordmark/logo — an envelope with an AI spark. */
export function LogoMark(props) {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" {...props}>
      {/* envelope body */}
      <rect x="3" y="8" width="26" height="18" rx="4"
        fill="url(#mm-grad)" opacity="0.95" />
      {/* flap */}
      <path d="M4 11l12 8 12-8" stroke="#0b0b12" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
      {/* AI spark — four-point star */}
      <path d="M23 4c.4 2.4 1.6 3.6 4 4-2.4.4-3.6 1.6-4 4-.4-2.4-1.6-3.6-4-4 2.4-.4 3.6-1.6 4-4Z"
        fill="#fff" opacity="0.95" />
      <defs>
        <linearGradient id="mm-grad" x1="3" y1="8" x2="29" y2="26"
          gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c6ef9" />
          <stop offset="1" stopColor="#1d9e75" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function InboxIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6l2-8Z" />
    </svg>
  )
}

export function ImportantIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
    </svg>
  )
}

export function StarIcon({ filled, ...props }) {
  return (
    <svg {...base} width="20" height="20" fill={filled ? 'currentColor' : 'none'} {...props}>
      <path d="m12 3 2.6 5.6 6 .9-4.4 4.3 1 6.1L12 17.8 6.5 20l1-6.1L3.1 9.5l6-.9L12 3Z" />
    </svg>
  )
}

export function SettingsIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </svg>
  )
}

export function ReplyIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M9 17 4 12l5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v2" />
    </svg>
  )
}

export function ForwardIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="m15 17 5-5-5-5" />
      <path d="M20 12H9a5 5 0 0 0-5 5v2" />
    </svg>
  )
}

export function ArchiveIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

export function TrashIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function SendIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="m4 12 16-8-7 16-2.5-6.5L4 12Z" />
    </svg>
  )
}

export function SearchIcon(props) {
  return (
    <svg {...base} width="16" height="16" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function PaperclipIcon(props) {
  return (
    <svg {...base} width="16" height="16" {...props}>
      <path d="M21 12.5 12 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
    </svg>
  )
}

export function CloseIcon(props) {
  return (
    <svg {...base} width="16" height="16" {...props}>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  )
}

export function DotIcon(props) {
  return (
    <svg viewBox="0 0 8 8" width="8" height="8" fill="currentColor" {...props}>
      <circle cx="4" cy="4" r="4" />
    </svg>
  )
}

/** Envelope — primary "mail / inbox" mark. */
export function MailIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

/** Download — used for fetching / exporting mail. */
export function DownloadIcon(props) {
  return (
    <svg {...base} width="20" height="20" {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  )
}

/** Brain/AI — used for the LLM model status / warmup button. */
export function BrainIcon(props) {
  return (
    <svg {...base} width="18" height="18" {...props}>
      <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1.5 4.5A2.5 2.5 0 0 0 9 21V3Z" />
      <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1.5 4.5A2.5 2.5 0 0 1 15 21V3Z" />
      <path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M9 16h1.5M13.5 16H15" />
    </svg>
  )
}
