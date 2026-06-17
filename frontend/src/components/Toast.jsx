import { createContext, useCallback, useContext, useRef, useState } from 'react'

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
    info:    'bg-ink-900 border-ink-700 text-ink-200',
    success: 'bg-ink-900 border-emerald-500/40 text-emerald-200',
    error:   'bg-ink-900 border-red-500/40 text-red-200',
  }[toast.kind]
  const icon = { info: 'ℹ️', success: '✅', error: '⚠️' }[toast.kind]
  return (
    <div className={`border rounded-md px-3 py-2.5 text-sm shadow-lg flex gap-2 ${styles}`}>
      <span>{icon}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button onClick={onClose} className="text-ink-400 hover:text-ink-200" aria-label="dismiss">✕</button>
    </div>
  )
}
