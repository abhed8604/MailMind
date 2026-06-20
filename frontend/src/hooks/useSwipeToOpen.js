import { useEffect, useRef } from 'react'

/**
 * Detects a "swipe from the left edge" gesture to open the mobile menu.
 *
 * Listens for touchstart/touchmove/touchend on the document. A swipe is
 * recognised when:
 *   - it starts within `edgeWidth` pixels of the left edge,
 *   - it moves horizontally rightward by at least `threshold` pixels,
 *   - the horizontal travel is greater than the vertical travel (not a scroll),
 *   - the drawer isn't already open.
 *
 * No-op on desktop (width >= 768px).
 *
 * @param {object} opts
 * @param {boolean} opts.enabled   Whether to listen (false on desktop / drawer open).
 * @param {() => void} opts.onOpen Called when a valid open-swipe is detected.
 * @param {number}   [opts.edgeWidth]  Width of the left-edge zone. Default 28.
 * @param {number}   [opts.threshold]  Horizontal travel needed. Default 45.
 */
export function useSwipeToOpen({ enabled, onOpen, edgeWidth = 28, threshold = 45 }) {
  const startRef = useRef(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!enabled) return

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) { startRef.current = null; return }
      const t = e.touches[0]
      // Only start a swipe candidate if the finger is in the left edge zone.
      if (t.clientX <= edgeWidth) {
        startRef.current = { x: t.clientX, y: t.clientY }
      } else {
        startRef.current = null
      }
    }

    const onTouchEnd = (e) => {
      const s = startRef.current
      startRef.current = null
      if (!s) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      const dy = Math.abs(t.clientY - s.y)
      // Horizontal-right swipe that beats vertical travel and crosses threshold.
      if (dx >= threshold && dx > dy) onOpenRef.current?.()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, edgeWidth, threshold])
}
