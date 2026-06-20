import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Adds pull-to-refresh behaviour to a scrollable container on mobile.
 *
 * When the user pulls down from the very top of the list, a spinner appears.
 * After releasing past the threshold, `onRefresh` is called.
 *
 * Returns a `refCallback` to spread onto the scrollable element:
 *   const pullDist = usePullToRefresh({ onRefresh })
 *   <div ref={refCallback} ...>
 *
 * We deliberately hold the DOM node in useState (via a callback ref) rather
 * than a plain useRef. The scroll container in EmailList is keyed by
 * `key={filter}`, so it unmounts/remounts on every tab switch — a useRef would
 * keep pointing at the stale detached node and the touch listeners would
 * silently stop firing. useState triggers a re-render (and thus an effect
 * re-run) whenever the node changes, keeping listeners attached to the live
 * element.
 *
 * @param {() => void} onRefresh  Called when a pull-to-refresh is triggered.
 * @param {number}     threshold  Pull distance (px) needed to trigger refresh. Default 60.
 */
export function usePullToRefresh({ onRefresh, threshold = 60 } = {}) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const [scrollEl, setScrollEl] = useState(null)

  const [pullDist, setPullDist] = useState(0)
  const touchRef = useRef(null) // { startY, currentY, pulling }

  const reset = useCallback(() => {
    touchRef.current = null
    setPullDist(0)
  }, [])

  useEffect(() => {
    const el = scrollEl
    if (!el) return

    const onTouchStart = (e) => {
      // Only trigger when at the very top of the scroll.
      if (el.scrollTop <= 0) {
        touchRef.current = {
          startY: e.touches[0].clientY,
          currentY: e.touches[0].clientY,
          pulling: true,
        }
        setPullDist(0)
      }
    }

    const onTouchMove = (e) => {
      const t = touchRef.current
      if (!t || !t.pulling) return

      t.currentY = e.touches[0].clientY
      const dist = Math.max(0, t.currentY - t.startY)
      // Apply resistance so it feels natural.
      setPullDist(dist * 0.4)

      // Prevent the browser's own pull-to-refresh from taking over.
      if (dist > 10) e.preventDefault()
    }

    const onTouchEnd = () => {
      const t = touchRef.current
      if (!t || !t.pulling) return

      const dist = Math.max(0, (t.currentY - t.startY) * 0.4)

      if (dist >= threshold) {
        setPullDist(0)
        touchRef.current = null
        onRefreshRef.current?.()
      } else {
        reset()
      }
    }

    // Use passive:false on touchmove so preventDefault works.
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [scrollEl, threshold, reset])

  // Callback ref the caller spreads onto the scroll element. Returns the
  // node to useState, which re-runs the effect above.
  const refCallback = useCallback((node) => setScrollEl(node), [])

  // Return both the pull distance (for the indicator) and the ref callback.
  return { pullDist, refCallback }
}
