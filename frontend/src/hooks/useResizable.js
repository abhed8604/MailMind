import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hook for a draggable panel divider.
 *
 * Drives a flex layout where the "list" panel takes `leftPct%` of the
 * available width (after the fixed sidebar) and the "reading" pane takes the
 * rest. The divider between them is dragged horizontally to adjust both.
 *
 * @param {object}  opts
 * @param {number}  opts.initial   Initial list-panel percentage (0–100). Default 38.
 * @param {number}  opts.min       Minimum list-panel percentage. Default 20.
 * @param {number}  opts.max       Maximum list-panel percentage. Default 70.
 * @returns {{ leftPct, onPointerDown, dragging }}
 */
export function useResizable({ initial = 38, min = 20, max = 70 } = {}) {
  const [leftPct, setLeftPct] = useState(initial)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef(null)
  // Captured at pointer-down so move/up listeners can read the container rect
  // without re-querying on every event.
  const startState = useRef(null)

  const onPointerDown = useCallback((e) => {
    // The divider's parent is the flex container wrapping both panels.
    const container = e.currentTarget.parentElement
    if (!container) return
    containerRef.current = container
    startState.current = {
      startX: e.clientX,
      rect: container.getBoundingClientRect(),
      startPct: leftPct,
    }
    setDragging(true)
    e.preventDefault()
  }, [leftPct])

  useEffect(() => {
    if (!dragging) return

    const onMove = (e) => {
      const st = startState.current
      if (!st || !st.rect.width) return
      const deltaPx = e.clientX - st.startX
      const deltaPct = (deltaPx / st.rect.width) * 100
      const next = Math.max(min, Math.min(max, st.startPct + deltaPct))
      setLeftPct(next)
    }

    const onUp = () => {
      setDragging(false)
      startState.current = null
      containerRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, min, max])

  return { leftPct, onPointerDown, dragging }
}
