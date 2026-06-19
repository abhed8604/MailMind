import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import TriageBadge from './TriageBadge'
import { categoryMeta, relativeTime } from '../lib/categories'
import { rescanEmail } from '../api/client'
import { companyForEmail } from '../lib/company'
import {
  ReplyIcon, ForwardIcon, StarIcon, ArchiveIcon, TrashIcon,
  SendIcon, PaperclipIcon, CloseIcon,
} from './Icon'

/**
 * Panel 3 — mail reader.
 *
 * Structure: subject heading → sender row (avatar + name + email + timestamp)
 * → action bar (reply / forward / star / archive / trash) → scrollable body
 * → attachment chips → reply bar pinned to the bottom. The reply bar and
 * attachment chips use the same frosted glass as the list bubbles.
 *
 * Width is controlled by the parent PanelGroup; this component fills its panel.
 *
 * Star works end-to-end. Reply / Forward / Archive / Trash surface a clear
 * toast because the Gmail integration is read+modify scope only (no send /
 * delete yet) — we never fail silently.
 */
export default function EmailReader({ email, account, bodyLoading, onToggleRead, onToggleStar, onClose, onToast, onRescanned }) {
  const [rescanning, setRescanning] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')

  const cleanHtml = useMemo(() => {
    if (!email?.body_html) return ''
    return DOMPurify.sanitize(email.body_html, { USE_PROFILES: { html: true } })
  }, [email?.body_html])

  // True when the full body hasn't been fetched yet.
  const bodyPending = !!email && bodyLoading && !email.body_html

  if (!email) {
    return (
      <aside
        className="w-full h-full hidden md:flex flex-col items-center justify-center text-white/25 text-[13px] glass-subtle"
        style={{ borderLeft: '0.5px solid rgba(255,255,255,0.06)' }}
      >
        <div className="text-4xl mb-3 opacity-30">✉️</div>
        Select an email to read it.
      </aside>
    )
  }

  const cat = categoryMeta(email.category)
  const senderLabel = email.sender_name || companyForEmail(email.sender_email)

  async function handleRescan() {
    setRescanning(true)
    try {
      const { summary, email: updated } = await rescanEmail(email.id)
      if (summary?.unavailable) {
        onToast?.error('Ollama unavailable — start it or check Settings.')
      } else {
        onToast?.success(`Re-scanned. Score: ${updated.importance_score} · ${categoryMeta(updated.category).label}`)
        onRescanned?.(updated)
      }
    } catch (e) {
      onToast?.error(`Rescan failed: ${e.message}`)
    } finally {
      setRescanning(false)
    }
  }

  function notAvailable(action) {
    onToast?.info(`${action} needs Gmail send/modify permissions — not wired up yet. Star and read/unread work.`)
  }

  return (
    <aside
      className="w-full h-full flex flex-col glass-subtle"
      style={{ borderLeft: '0.5px solid rgba(255,255,255,0.06)' }}
    >
      {/* Subject heading */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <h1 className="flex-1 text-primary text-[16px] font-medium leading-snug">
            {email.subject || '(no subject)'}
          </h1>
          <button onClick={onClose} className="md:hidden text-white/40 hover:text-white" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Sender row */}
      <div className="px-5 pb-3 flex items-start gap-3">
        <Avatar name={senderLabel} color={account?.color} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sender text-[13px] font-medium truncate">{senderLabel}</span>
            {email.sender_email && (
              <span className="text-timestamp text-[11px] font-mono truncate hidden sm:inline">
                &lt;{email.sender_email}&gt;
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-timestamp text-[11px] font-mono">
              {email.date ? new Date(email.date).toLocaleString() : ''}
            </span>
            <span className="text-timestamp text-[11px]">· {relativeTime(email.date)}</span>
          </div>
        </div>
      </div>

      {/* Triage summary (compact, inline) */}
      {(email.scanned_at || email.importance_score != null) && (
        <div className="mx-5 mb-3 px-3 py-2 rounded-xl flex items-center gap-2 flex-wrap"
          style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
          <TriageBadge email={email} />
          {email.importance_reason && (
            <span className="text-[11px] text-white/40 italic truncate flex-1 min-w-0">
              “{email.importance_reason}”
            </span>
          )}
          <button
            onClick={handleRescan}
            disabled={rescanning}
            className="text-[10px] text-white/40 hover:text-white/80 disabled:opacity-40 uppercase tracking-wide"
          >
            {rescanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className="px-5 pb-3 flex items-center gap-1">
        <ActionIcon label="Reply" onClick={() => { setReplyOpen(true); notAvailable('Reply (compose)') }}>
          <ReplyIcon />
        </ActionIcon>
        <ActionIcon label="Forward" onClick={() => notAvailable('Forward')}>
          <ForwardIcon />
        </ActionIcon>
        <ActionIcon
          label="Star"
          onClick={() => onToggleStar?.(email)}
          active={email.is_starred}
          activeColor="#fbbf24"
        >
          <StarIcon filled={email.is_starred} />
        </ActionIcon>
        <ActionIcon label="Archive" onClick={() => notAvailable('Archive')}>
          <ArchiveIcon />
        </ActionIcon>
        <ActionIcon label="Trash" onClick={() => notAvailable('Delete')}>
          <TrashIcon />
        </ActionIcon>
      </div>

      {/* Divider before body */}
      <div className="mx-5 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {bodyPending ? (
          <BodySkeleton />
        ) : cleanHtml ? (
          <EmailFrame html={cleanHtml} />
        ) : (
          <pre className="email-body whitespace-pre-wrap">{email.body_text || email.body_text === '' ? email.body_text : '(no body)'}</pre>
        )}
      </div>

      {/* Attachment chips (only render if the email carries attachment data) */}
      {Array.isArray(email.attachments) && email.attachments.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {email.attachments.map((att, i) => (
            <div key={i} className="glass-subtle rounded-full px-2.5 py-1 flex items-center gap-1.5 text-[11px] text-white/55">
              <PaperclipIcon width={12} height={12} />
              <span className="truncate max-w-[140px]">{att.name || att.filename || 'attachment'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Reply bar pinned to the bottom — frosted glass */}
      <div className="px-5 pb-4 pt-2">
        <div className="glass rounded-full flex items-center gap-2 pl-4 pr-1.5 py-1.5">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onFocus={() => setReplyOpen(true)}
            placeholder={replyOpen ? 'Write a reply…' : 'Reply…'}
            className="flex-1 bg-transparent text-[13px] text-primary placeholder:text-white/30 focus:outline-none"
          />
          <button
            onClick={() => {
              if (replyText.trim()) notAvailable('Send reply')
              setReplyText('')
              setReplyOpen(false)
            }}
            className="h-8 w-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: '#7c6ef9', color: '#fff' }}
            aria-label="Send"
          >
            <SendIcon width={15} height={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function BodySkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-3/4 rounded-full skeleton" />
      <div className="h-4 w-full rounded-full skeleton" />
      <div className="h-4 w-5/6 rounded-full skeleton" />
      <div className="h-4 w-2/3 rounded-full skeleton" />
      <div className="h-4 w-full rounded-full skeleton" />
      <div className="h-4 w-1/2 rounded-full skeleton" />
    </div>
  )
}

/** Round icon button in the reader action bar. */
function ActionIcon({ children, label, onClick, active, activeColor }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/8 transition-colors"
      style={active && activeColor ? { color: activeColor } : undefined}
    >
      {children}
    </button>
  )
}

function Avatar({ name, color }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  const c = color || '#7c6ef9'
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-medium shrink-0"
      style={{ background: `${c}33`, color: c, boxShadow: `0 0 8px ${c}44` }}
    >
      {initial}
    </div>
  )
}

/**
 * Renders email HTML inside a sandboxed iframe so the email's own <style> /
 * <body> rules can't leak out and override the app theme. The iframe auto-sizes
 * to its content height. Background/text colors are themed to match the dark UI.
 */
function EmailFrame({ html }) {
  const ref = useRef(null)

  // Wrap the email HTML in a themed document and write it into the iframe.
  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return

    const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        :root { color-scheme: dark; }
        html, body {
          margin: 0; padding: 0;
          background: transparent;
          color: rgba(255,255,255,0.78);
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px; line-height: 1.65;
          word-wrap: break-word;
        }
        a { color: #a78bfa; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
        table { max-width: 100%; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        * { max-width: 100%; }
      </style>
    </head><body>${html}</body></html>`

    doc.open()
    doc.write(wrapped)
    doc.close()

    // Size the iframe to fit its content.
    const resize = () => {
      try {
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
        iframe.style.height = `${h + 4}px`
      } catch { /* ignore */ }
    }
    resize()
    // Re-measure shortly after in case images/fonts shift layout.
    const t1 = setTimeout(resize, 100)
    const t2 = setTimeout(resize, 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [html])

  return (
    <iframe
      ref={ref}
      title="email body"
      sandbox="allow-same-origin allow-popups"
      className="w-full border-0"
      style={{ minHeight: 120, background: 'transparent' }}
    />
  )
}
