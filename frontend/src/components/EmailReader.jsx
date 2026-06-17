import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import TriageBadge from './TriageBadge'
import { categoryMeta, relativeTime } from '../lib/categories'
import { rescanEmail } from '../api/client'

/**
 * Right-hand reading pane. Renders the email body with DOMPurify (never raw
 * HTML), shows triage metadata, and exposes read/unread/star + per-email
 * rescan actions. A small inline loading state covers the rescan call.
 */
export default function EmailReader({ email, account, onToggleRead, onToggleStar, onClose, onToast, onRescanned }) {
  const [rescanning, setRescanning] = useState(false)

  const cleanHtml = useMemo(() => {
    if (!email?.body_html) return ''
    return DOMPurify.sanitize(email.body_html, { USE_PROFILES: { html: true } })
  }, [email?.body_html])

  if (!email) {
    return (
      <div className="flex-1 hidden md:flex items-center justify-center text-ink-500 text-sm bg-ink-950">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">✉️</div>
          Select an email to read it.
        </div>
      </div>
    )
  }

  const cat = categoryMeta(email.category)

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

  return (
    <div className="flex-1 flex flex-col bg-ink-950 min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-800/60">
        <button onClick={onClose} className="md:hidden text-ink-400 hover:text-ink-100 text-sm">‹ Back</button>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton onClick={() => onToggleRead?.(email)} title={email.is_read ? 'Mark unread' : 'Mark read'}>
            {email.is_read ? '●' : '✓ Read'}
          </ToolButton>
          <ToolButton onClick={() => onToggleStar?.(email)} title="Star">
            <span className={email.is_starred ? 'text-amber-400' : ''}>★</span>
          </ToolButton>
          <ToolButton onClick={handleRescan} disabled={rescanning} title="Re-run triage on this email">
            {rescanning ? 'Scanning…' : '⚡ Rescan'}
          </ToolButton>
        </div>
      </div>

      {/* Headers */}
      <div className="px-6 py-4 border-b border-ink-800/60">
        <h1 className="text-lg font-semibold text-ink-100 leading-snug">
          {email.subject || '(no subject)'}
        </h1>
        <div className="mt-3 flex items-start gap-3">
          <Avatar name={email.sender_name || email.sender_email || '?'} color={account?.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-ink-100 font-medium">
                {email.sender_name || 'Unknown'}
              </span>
              {email.sender_email && (
                <span className="font-mono text-[12px] text-ink-400">&lt;{email.sender_email}&gt;</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {account && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono"
                  style={{ background: `${account.color}22`, color: account.color }}
                >
                  {account.email}
                </span>
              )}
              <span className="font-mono text-[11px] text-ink-400">
                {email.date ? new Date(email.date).toLocaleString() : ''}
              </span>
              <span className="font-mono text-[11px] text-ink-500">· {relativeTime(email.date)}</span>
            </div>
          </div>
        </div>

        {/* Triage summary */}
        {(email.scanned_at || email.importance_score != null) && (
          <div className="mt-3 rounded-md border border-ink-800 bg-ink-900/60 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-ink-400">Triage</span>
              <TriageBadge email={email} />
              {email.scanned_at && (
                <span className="ml-auto font-mono text-[11px] text-ink-500">
                  {email.scan_model || 'model'} · {relativeTime(email.scanned_at)}
                </span>
              )}
            </div>
            {email.importance_reason && (
              <p className="mt-1.5 text-[13px] text-ink-300 italic">“{email.importance_reason}”</p>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {cleanHtml ? (
          <div className="email-body" dangerouslySetInnerHTML={{ __html: cleanHtml }} />
        ) : (
          <pre className="email-body whitespace-pre-wrap font-sans">{email.body_text || '(no body)'}</pre>
        )}
      </div>
    </div>
  )
}

function ToolButton({ children, onClick, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="px-2.5 py-1.5 rounded-md text-[12px] text-ink-300 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function Avatar({ name, color }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
      style={{ background: `${color || '#60a5fa'}22`, color: color || '#60a5fa' }}
    >
      {initial}
    </div>
  )
}
