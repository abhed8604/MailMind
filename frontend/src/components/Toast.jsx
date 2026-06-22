import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { Info, CheckCircle, WarningCircle, X } from '@phosphor-icons/react'

const ToastCtx = createContext(null)

/** Convenience hook for any component that needs to push a toast. */
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = ++_id
    const toast = { id, message, kind: opts.kind || 'info', duration: opts.duration ?? 5000 }
    setToasts((t) => [...t, toast])
    if (toast.duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), toast.duration)
    }
    return id
  }, [dismiss])

  // Helpers for the common kinds.
  const api = {
    push,
    info: (m, o) => push(m, { ...o, kind: 'info' }),
    success: (m, o) => push(m, { ...o, kind: 'success' }),
    error: (m, o) => push(m, { ...o, kind: 'error', duration: o?.duration ?? 8000 }),
    dismiss,
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function ToastCard({ toast, onClose }) {
  const styles = {
    info:    { bg: '#1a1a2e', border: 'rgba(255,255,255,0.09)', color: '#7eaaff' },
    success: { bg: '#1a1a2e', border: 'rgba(78,207,142,0.4)',    color: '#4ecf8e' },
    error:   { bg: '#1a1a2e', border: 'rgba(248,113,113,0.4)',   color: '#fca5a5' },
  }[toast.kind]
  const Glyph = { info: Info, success: CheckCircle, error: WarningCircle }[toast.kind]
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm flex gap-2 items-start"
      style={{ background: styles.bg, border: `0.5px solid ${styles.border}`, color: styles.color }}
    >
      <Glyph size={16} weight="fill" color={styles.color} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span className="flex-1 leading-snug" style={{ color: 'rgba(255,255,255,0.85)' }}>{toast.message}</span>
      <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)' }} aria-label="dismiss"><X size={14} weight="bold" /></button>
    </div>
  )
}
