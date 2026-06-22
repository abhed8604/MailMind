/**
 * Icon registry — single source of truth for all UI icons.
 *
 * Skill §3.C / §9.E: hand-rolled SVG icon paths are banned. Every glyph below
 * is a re-export of a Phosphor icon (@phosphor-icons/react), the project's one
 * allowed icon family. Components import from here so the abstraction never
 * leaks the library name into the call sites.
 *
 * Each wrapper forwards props (size via width/height, weight, color through
 * currentColor) to the underlying Phosphor component. Phosphor defaults to
 * weight="regular" / 1.5px-equivalent strokes, consistent across the family.
 *
 * `LogoMark` is the lone exception: it is the BRAND MARK, not an icon, and
 * skill §4.8 permits a single custom geometric/wordmark mark.
 */
import {
  EnvelopeSimple,
  Lightning,
  ArrowsClockwise,
  DownloadSimple,
  Brain,
  Gear,
  Star,
  MagnifyingGlass,
  ArrowBendUpLeft,
  ArrowBendUpRight,
  Archive,
  Trash,
  PaperPlaneRight,
  X,
  Paperclip,
  List,
  CaretLeft,
} from '@phosphor-icons/react'

/** Mail / inbox mark. */
export function MailIcon(props) {
  return <EnvelopeSimple weight="regular" {...props} />
}

/** Scan / triage mark (lightning = "scan for importance"). */
export function ScanIcon(props) {
  return <Lightning weight="regular" {...props} />
}

/** Circular refresh — "Rescan all" (distinct from the sync arrows). */
export function RescanIcon(props) {
  return <ArrowsClockwise weight="regular" {...props} />
}

/** Up/down arrows — "Sync now" (fetch new mail). */
export function SyncIcon(props) {
  return <DownloadSimple weight="regular" {...props} />
}

/** Download — fetching / exporting mail. */
export function DownloadIcon(props) {
  return <DownloadSimple weight="regular" {...props} />
}

/** Brain / AI — LLM model status + warmup button. */
export function BrainIcon(props) {
  return <Brain weight="regular" {...props} />
}

/** Settings / gear. */
export function SettingsIcon(props) {
  return <Gear weight="regular" {...props} />
}

/** Star — toggles filled via the `filled` prop (semantic "starred" state). */
export function StarIcon({ filled, ...props }) {
  return <Star weight={filled ? 'fill' : 'regular'} {...props} />
}

/** Search. */
export function SearchIcon(props) {
  return <MagnifyingGlass weight="regular" {...props} />
}

/** Reply. */
export function ReplyIcon(props) {
  return <ArrowBendUpLeft weight="regular" {...props} />
}

/** Forward. */
export function ForwardIcon(props) {
  return <ArrowBendUpRight weight="regular" {...props} />
}

/** Archive. */
export function ArchiveIcon(props) {
  return <Archive weight="regular" {...props} />
}

/** Delete / trash. */
export function TrashIcon(props) {
  return <Trash weight="regular" {...props} />
}

/** Send. */
export function SendIcon(props) {
  return <PaperPlaneRight weight="regular" {...props} />
}

/** Close / X. */
export function CloseIcon(props) {
  return <X weight="regular" {...props} />
}

/** Paperclip — attachments. */
export function PaperclipIcon(props) {
  return <Paperclip weight="regular" {...props} />
}

/** Hamburger / menu (mobile drawer toggle). */
export function MenuIcon(props) {
  return <List weight="regular" {...props} />
}

/** Back chevron (settings → inbox). */
export function BackIcon(props) {
  return <CaretLeft weight="regular" {...props} />
}

/**
 * MailMind brand mark — envelope with an AI spark. Custom SVG is permitted
 * here because this is the brand wordmark (skill §4.8), not an icon. Do not
 * draw other glyphs by hand; add them to the Phosphor wrappers above.
 */
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
