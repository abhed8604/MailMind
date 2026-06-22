import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'
import DOMPurify from 'dompurify'
import ScanProgressBar from './ScanProgressBar'
import { categoryMeta, relativeTime, scoreBadgeStyle } from '../lib/categories'
import { accountRamp, companyForEmail } from '../lib/company'
import { rescanEmail } from '../api/client'
import {
  ReplyIcon, ForwardIcon, StarIcon, ArchiveIcon, TrashIcon,
  SendIcon, CloseIcon,
} from './Icon'

// Ensure all links in sanitized HTML open in a new tab.
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

// Regex for detecting bare URLs in plain text and turning them into links.
const URL_RE = /(?<!["'=])(https?:\/\/[^\s<>'")\]]+)/gi

/**
 * Linkify a plain-text string: wrap bare URLs in <a> tags that open in a
 * new tab. Used for the <pre> fallback when there is no HTML body.
 */
function linkifyText(text) {
  if (!text) return text
  return text.replace(URL_RE, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
}

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
  onCancelScan, accountColorMap,
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
        style={{ background: 'var(--bg-reader)', position: 'relative' }}
      >
        <span className="text-[13px]" style={{ color: 'var(--placeholder-icon)' }}>
          Select an email to read it.
        </span>
        <ScanProgressBar
          running={scanRunning}
          progress={scanProgress}
          onCancel={onCancelScan}
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
        onToast?.error('Ollama unavailable. Start it or check Settings.')
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
    onToast?.info(`${action} needs Gmail send/modify permissions. Not wired up yet.`)
  }

  return (
    <aside
      className="flex-1 min-w-0 h-full flex flex-col"
      style={{ background: 'var(--bg-reader)', position: 'relative' }}
    >
      {/* ---- TOOLBAR (top bar) ---- */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '8px 14px', borderBottom: '0.5px solid var(--border-faint)' }}
      >
        {/* Left: category tag pill */}
        <div className="flex items-center gap-2">
          {email.category && (
            <span
              className="rounded-full inline-flex items-center"
              style={{
                fontSize: '10px',
                background: 'var(--surface-fill)',
                color: 'var(--text-faint)',
                padding: '2px 7px',
                gap: 3,
                lineHeight: 1,
              }}
            >
              <cat.glyph size={11} weight="fill" color="var(--text-hint)" aria-hidden="true" />
              <span>{cat.label}</span>
            </span>
          )}
          {(email.scanned_at || email.importance_score != null) && (
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="text-[10px] uppercase tracking-wide transition-colors disabled:opacity-30"
              style={{ color: 'var(--text-hint)' }}
              onMouseEnter={(e) => { if (!rescanning) e.currentTarget.style.color = 'var(--text-headline)' }}
              onMouseLeave={(e) => { if (!rescanning) e.currentTarget.style.color = 'var(--text-hint)' }}
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

      {/* ---- SCROLLABLE CONTENT (meta + summary + body) ---- */}
      {/* Wrapping these together lets the summary scroll away with the body on
          mobile, instead of pinning and eating screen space. */}
      <div className="flex-1 overflow-y-auto mm-email-scroll min-w-0" style={{ overflowX: 'hidden' }}>
        {/* ---- EMAIL META BLOCK ----
            Hierarchy: subject (primary) → From/Date (secondary) → badges (footer).
            Each tier steps down in weight + opacity so the eye lands on the
            subject first, per skill §11.D lever 1 (typography refresh). */}
        <div
          className="mx-4 mt-3 mm-email-meta"
          style={{
            background: 'var(--bg-meta)',
            borderRadius: 'var(--radius-surface)',
            padding: '14px 16px',
          }}
        >
          {/* Subject — primary tier */}
          <h1 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-headline)', lineHeight: '1.3', letterSpacing: '-0.01em' }}>
            {email.subject || '(no subject)'}
          </h1>

          {/* Meta rows — secondary tier */}
          <div className="mt-2.5 space-y-1">
            <MetaRow label="From" value={`${senderLabel} <${email.sender_email || ''}>`} />
            <MetaRow label="Date" value={email.date ? new Date(email.date).toLocaleString() : ''} />
          </div>

          {/* Badge row — footer tier (divided, reduced weight) */}
          <div
            className="flex items-center gap-2 mt-3"
            style={{ paddingTop: 'var(--space-sm)', borderTop: '0.5px solid var(--border-faint)' }}
          >
            {/* Relevance score chip */}
            {score != null && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-chip)',
                  ...scoreBadgeStyle(score),
                }}
              >
                relevance {score}
              </span>
            )}

            {/* Spacer pushes the pill + star to the far right */}
            <span className="flex-1" />

            {/* Account pill — shows receiving account email */}
            <span
              className="shrink-0"
              style={{
                fontSize: '9px',
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: 'var(--radius-pill)',
                background: acctRamp.pillBg,
                color: acctRamp.color,
              }}
            >
              {account?.email || email.sender_email}
            </span>

            {/* Star */}
            <span
              className="cursor-pointer shrink-0"
              style={{ color: email.is_starred ? '#f0a030' : 'var(--text-preview)', fontSize: '14px' }}
              onClick={() => onToggleStar?.(email)}
            >
              <StarIcon width={14} height={14} filled={email.is_starred} />
            </span>
          </div>
        </div>

        {/* ---- AI SUMMARY ---- */}
        {email.ai_summary && (
          <div
            className="mx-4 mt-3 mm-email-meta"
            style={{
              background: 'rgba(126, 170, 255, 0.06)',
              border: '0.5px solid rgba(126, 170, 255, 0.12)',
              borderRadius: '8px',
              padding: '10px 14px',
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(126, 170, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <Sparkle size={11} weight="fill" style={{ verticalAlign: '-1px', marginRight: 4 }} aria-hidden="true" />AI Summary
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-body)', lineHeight: '1.6', margin: 0 }}>
              {email.ai_summary}
            </p>
          </div>
        )}

        {/* ---- EMAIL BODY ---- */}
        <div className="mm-email-body" style={{ padding: '20px 22px' }}>
          {bodyPending ? (
            <BodySkeleton />
          ) : cleanHtml ? (
            <EmailFrame html={cleanHtml} />
          ) : (
            <pre className="email-body whitespace-pre-wrap" style={{ margin: 0 }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(linkifyText(email.body_text || '(no body)'), { USE_PROFILES: { html: true } }) }}
            />
          )}
        </div>
      </div>

      {/* Floating scanning pill */}
      <ScanProgressBar
        running={scanRunning}
        progress={scanProgress}
        onCancel={onCancelScan}
      />

      {/* ---- REPLY BAR (pinned to bottom) ---- */}
      <div
        className="shrink-0 flex items-center gap-2 mm-reply-bar"
        style={{
          padding: '8px 14px',
          background: 'var(--surface-fill-faint)',
          borderTop: '0.5px solid var(--border-faint)',
        }}
      >
        <div
          className="flex items-center flex-1"
          style={{
            background: 'var(--surface-fill)',
            border: '0.5px solid var(--border-strong)',
            borderRadius: 'var(--radius-surface)',
            padding: '8px 12px',
          }}
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Reply to ${senderLabel}...`}
            className="bg-transparent flex-1 text-[12px] focus:outline-none"
            style={{ color: 'var(--text-label)' }}
          />
        </div>
        <button
          onClick={() => { if (replyText.trim()) notAvailable('Send reply'); setReplyText('') }}
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-surface)',
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
      <span className="shrink-0" style={{ fontSize: '11px', color: 'var(--text-hint)', width: 34 }}>
        {label}
      </span>
      <span style={{ fontSize: '11px', color: 'var(--text-sender)' }}>
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
        color: active ? '#f0a030' : 'var(--text-hint)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-headline)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-hint)' }}
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
 *
 * Uses `srcDoc` (not contentDocument.write) and a sandbox WITHOUT
 * `allow-same-origin`, so the iframe gets a unique opaque origin and truly
 * cannot reach the parent document — no "sandbox escape" console warning.
 * The iframe's height is measured via a small in-iframe <script> that posts
 * its scrollHeight back to the parent through postMessage (only allow-scripts
 * is granted, which is safe without allow-same-origin).
 */
function EmailFrame({ html }) {
  const ref = useRef(null)

  // Listening for the iframe's height reports.
  useEffect(() => {
    const onMessage = (ev) => {
      const iframe = ref.current
      if (!iframe || ev.source !== iframe.contentWindow) return
      const h = Number(ev.data?.mailmindHeight)
      if (h && h > 0) iframe.style.height = `${h + 4}px`
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const srcDoc = useMemo(() => {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        :root { color-scheme: dark; }
        html, body {
          margin: 0; padding: 0;
          background: transparent;
          color: rgba(255,255,255,0.60);
          /* Sandboxed iframe (opaque origin) cannot access the parent's
             self-hosted Geist. Fall back to the native system stack. No Google
             Fonts <link> per skill §4.1. */
          font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px; line-height: 1.75;
          word-wrap: break-word; overflow-wrap: anywhere;
          overflow-x: hidden;
        }
        a { color: #7eaaff; }
        img { max-width: 100%; height: auto; border-radius: 8px; }
        table { max-width: 100%; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        * { max-width: 100%; box-sizing: border-box; }
        p { margin: 0 0 10px; }
        ul, ol { margin: 0 0 10px 18px; }
        li { margin-bottom: 3px; }
      </style>
    </head><body>${html}<script>
      (function(){
        var report=function(){
          var h=Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          parent.postMessage({mailmindHeight:h}, "*");
        };
        report();
        if (document.readyState!=="complete"){
          window.addEventListener("load", report);
        }
        setTimeout(report,100);
        setTimeout(report,500);
        if (typeof ResizeObserver!=="undefined"){
          new ResizeObserver(report).observe(document.body);
        }
      })();
    </script></body></html>`
  }, [html])

  // Fallback height measurement (works even if in-iframe JS is blocked).
  useEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const fallback = () => {
      try {
        const d = iframe.contentDocument
        if (!d) return
        const h = d.documentElement.scrollHeight || d.body.scrollHeight
        if (h) iframe.style.height = `${h + 4}px`
      } catch { /* opaque origin — ignore, postMessage path covers it */ }
    }
    const t1 = setTimeout(fallback, 200)
    const t2 = setTimeout(fallback, 600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [html])

  return (
    <iframe
      ref={ref}
      title="email body"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups"
      className="w-full border-0"
      style={{ minHeight: 120, background: 'transparent' }}
    />
  )
}
