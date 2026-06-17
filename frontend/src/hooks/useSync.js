import { useCallback, useEffect, useRef, useState } from 'react'
import { getSyncStatus, triggerSync } from '../api/client'

const POLL_MS = 3000

/**
 * Polls the backend sync status and surfaces a "syncing" boolean plus the last
 * run timestamp. A manual trigger is also exposed; it fires a toast via the
 * provided callback.
 */
export function useSync({ onEvent } = {}) {
  const [status, setStatus] = useState({ running: false, last_run: null, last_result: null })
  const [manualRunning, setManualRunning] = useState(false)
  const timer = useRef(null)
  const wasRunning = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const s = await getSyncStatus()
      setStatus(s)
      // Edge-detect running→done to emit a completion toast.
      if (wasRunning.current && !s.running) {
        onEvent?.({ type: 'sync-done', result: s.last_result })
      }
      wasRunning.current = !!s.running
    } catch {
      /* transient — will retry on next tick */
    }
  }, [onEvent])

  useEffect(() => {
    refresh()
    timer.current = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer.current)
  }, [refresh])

  const syncNow = useCallback(async () => {
    setManualRunning(true)
    onEvent?.({ type: 'sync-start' })
    try {
      await triggerSync(true)
    } catch (e) {
      onEvent?.({ type: 'error', message: `Sync failed: ${e.message}` })
    } finally {
      setManualRunning(false)
    }
  }, [onEvent])

  return { status, manualRunning, syncNow, refresh }
}
