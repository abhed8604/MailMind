import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import ScanProgressBar from './ScanProgressBar'
import { categoryMeta, relativeTime, scoreBadgeStyle } from '../lib/categories'
import { accountRamp, companyForEmail } from '../lib/company'
import { rescanEmail } from '../api/client'
import {
  ReplyIcon, ForwardIcon, StarIcon, ArchiveIcon, TrashIcon,
  SendIcon, CloseIcon,
} from './Icon'

/**
 * Panel 3 — reading pane (flex: 1).
 *
 * Toolbar (top): category pill left, action icons right.
 * Meta block: subject, From/To/Date, badge row (score + account pill + star).
 * Body: scrollable email HTML or text.
 * Reply bar: pinned to bottom.
 */
export default function EmailReader({
  email, account, bodyLoading, onToggleRead, onToggleStar,
  onClose, onToast, onRescanned, scanRunning, scanProgress,
  onCancelScan, amoled, accountColorMap,
}) {
  const [rescanning, setRescanning] = useState(false)
  const [replyText, setReplyText] = useState('')

  const cleanHtml = useMemo(() => {
    if (!email?.body_html) return ''
    return DOMPurify.sanitize(email.body_html, { USE_PROFILES: { html: true } })
  }, [email?.body_html])

  const bodyPending = !!email && bodyLoading && !email.body_html

  if (!email) {
    return (
      <aside
        className="flex-1 h-full flex flex-col items-center justify-center"
        style={{ background: amoled ? '#000000' : '#1a1a2e', position: 'relative' }}
      >
        <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Select an email to read it.
        </span>
        <ScanProgressBar
          running={scanRunning}
          progress={scanProgress}
          onCancel={onCancelScan}
          amoled={amoled}
        />
      </aside>
    )
  }

  const cat = categoryMeta(email.category)
  const senderLabel = email.sender_name || companyForEmail(email.sender_email)
  const acctRamp = (accountColorMap && accountColorMap.get(email.account_id))
    || accountRamp(account?.email || email.sender_email)
  const score = email.importance_score

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
    onToast?.info(`${action} needs Gmail send/modify permissions — not wired up yet.`)
  }

  return (
    <aside
      className="flex-1 min-w-0 h-full flex flex-col"
      style={{ background: amoled ? '#000000' : '#1a1a2e', position: 'relative' }}
    >
      {/* ---- TOOLBAR (top bar) ---- */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '8px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}
      >
        {/* Left: category tag pill */}
        <div className="flex items-center gap-2">
          {email.category && (
            <span
              className="rounded-full"
              style={{
                fontSize: '10px',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.28)',
                padding: '2px 7px',
              }}
            >
              {cat.emoji} {cat.label} · {email.category === 'spam' ? 'spam' : 'promotional'}
            </span>
          )}
          {(email.scanned_at || email.importance_score != null) && (
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="text-[10px] uppercase tracking-wide transition-colors disabled:opacity-30"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {rescanning ? 'Scanning…' : 'Rescan'}
            </button>
          )}
        </div>

        {/* Right: action icons */}
        <div className="flex items-center" style={{ gap: '14px' }}>
          <ActionButton label="Reply" onClick={() => notAvailable('Reply')}>
            <ReplyIcon width={16} height={16} />
          </ActionButton>
          <ActionButton label="Forward" onClick={() => notAvailable('Forward')}>
            <ForwardIcon width={16} height={16} />
          </ActionButton>
          <ActionButton
            label="Star"
            onClick={() => onToggleStar?.(email)}
            active={email.is_starred}
          >
            <StarIcon width={16} height={16} filled={email.is_starred} />
          </ActionButton>
          <ActionButton label="Archive" onClick={() => notAvailable('Archive')}>
            <ArchiveIcon width={16} height={16} />
          </ActionButton>
          <ActionButton label="Delete" onClick={() => notAvailable('Delete')}>
            <TrashIcon width={16} height={16} />
          </ActionButton>
          <ActionButton label="Close" onClick={onClose}>
            <CloseIcon width={16} height={16} />
          </ActionButton>
        </div>
      </div>

      {/* ---- EMAIL META BLOCK ---- */}
      <div
        className="shrink-0 mx-4 mt-3"
        style={{
          background: amoled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.04)',
          borderRadius: '8px',
          padding: '12px 14px',
        }}
      >
        {/* Subject */}
        <h1 style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: '1.3' }}>
          {email.subject || '(no subject)'}
        </h1>

        {/* Meta rows: From / To / Date */}
        <div className="mt-2 space-y-1">
          <MetaRow label="From" value={`${senderLabel} <${email.sender_email || ''}>`} />
          <MetaRow label="Date" value={email.date ? new Date(email.date).toLocaleString() : ''} />
        </div>

        {/* Badge row */}
        <div
          className="flex items-center justify-between gap-2 mt-2"
          style={{ paddingTop: 10, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}
        >
          {/* Relevance score chip */}
          {score != null && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '3px',
                ...scoreBadgeStyle(score),
              }}
            >
              relevance {score}
            </span>
          )}

          {/* Account pill — shows receiving account email */}
          <span
            style={{
              fontSize: '9px',
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: '999px',
              background: acctRamp.pillBg,
              color: acctRamp.color,
            }}
          >
            {account?.email || email.sender_email}
          </span>

          {/* Star */}
          <span
            className="cursor-pointer"
            style={{ color: email.is_starred ? '#f0a030' : 'rgba(255,255,255,0.15)', fontSize: '14px' }}
            onClick={() => onToggleStar?.(email)}
          >
            <StarIcon width={14} height={14} filled={email.is_starred} />
          </span>
        </div>
      </div>

      {/* ---- EMAIL BODY ---- */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 22px' }}>
        {bodyPending ? (
          <BodySkeleton />
        ) : cleanHtml ? (
          <EmailFrame html={cleanHtml} />
        ) : (
          <pre className="email-body whitespace-pre-wrap" style={{ margin: 0 }}>
            {email.body_text || '(no body)'}
          </pre>
        )}
      </div>

      {/* Floating scanning pill */}
      <ScanProgressBar
        running={scanRunning}
        progress={scanProgress}
        onCancel={onCancelScan}
        amoled={amoled}
      />

      {/* ---- REPLY BAR (pinned to bottom) ---- */}
      <div
        className="shrink-0 flex items-center gap-2"
        style={{
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.02)',
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          className="flex items-center flex-1"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(255,255,255,0.09)',
            borderRadius: '8px',
            padding: '8px 12px',
          }}
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Reply to ${senderLabel}...`}
            className="bg-transparent flex-1 text-[12px] focus:outline-none"
            style={{ color: 'rgba(255,255,255,0.80)' }}
          />
        </div>
        <button
          onClick={() => { if (replyText.trim()) notAvailable('Send reply'); setReplyText('') }}
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            background: '#5B8DEF',
            color: '#fff',
          }}
          aria-label="Send"
        >
          <SendIcon width={14} height={14} />
        </button>
      </div>
    </aside>
  )
}

/** Meta row: fixed-width label + value. */
function MetaRow({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', width: 34 }}>
        {label}
      </span>
      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
        {value}
      </span>
    </div>
  )
}

/** Toolbar action icon button. */
function ActionButton({ children, label, onClick, active }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="transition-colors"
      style={{
        color: active ? '#f0a030' : 'rgba(255,255,255,0.30)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.30)' }}
    >
      {children}
    </button>
  )
}

function BodySkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-3/4 rounded-full skeleton" />
      <div className="h-4 w-full rounded-full skeleton" />
      <div className="h-4 w-5/6 rounded-full skeleton" />
      <div className="h-4 w-2/3 rounded-full skeleton" />
    </div>
  )
}

/**
 * Renders email HTML inside a sandboxed iframe so the email's own <style> /
 * <body> rules can't leak out and override the app theme.
 */
function EmailFrame({ html }) {
  const ref = useRef(null)

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
          color: rgba(255,255,255,0.60);
          font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px; line-height: 1.75;
          word-wrap: break-word;
        }
        a { color: #7eaaff; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
        table { max-width: 100%; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        * { max-width: 100%; }
        p { margin: 0 0 10px; }
        ul, ol { margin: 0 0 10px 18px; }
        li { margin-bottom: 3px; }
      </style>
    </head><body>${html}</body></html>`

    doc.open()
    doc.write(wrapped)
    doc.close()

    const resize = () => {
      try {
        const h = doc.documentElement.scrollHeight || doc.body.scrollHeight
        iframe.style.height = `${h + 4}px`
      } catch { /* ignore */ }
    }
    resize()
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
