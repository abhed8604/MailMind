import { useCallback, useEffect, useRef } from 'react'

/**
 * Single source of truth for mapping the hardware/browser back button to
 * closing overlays on mobile, instead of exiting the PWA.
 *
 * Why this exists:
 * The old approach mounted THREE separate `useBackButton` hooks (reader,
 * sidebar drawer, settings) — each pushed its own history entry and installed
 * its own `popstate` listener. When two overlays were open at once (e.g. the
 * reader visible while settings state lingered) the three hooks raced on
 * `history.pushState` / `history.back` within the same render cycle, leaving
 * the history stack unbalanced and the back button effectively dead.
 *
 * This hook keeps ONE history entry and ONE popstate listener for the whole
 * app. When any overlay is open we push a single sentinel history entry; when
 * back is pressed we call the topmost overlay's closer, which flips its state
 * closed. The effect then re-runs and pops our pushed entry so the browser
 * history stays balanced.
 *
 * @param {boolean}   enabled   Master switch (typically `isMobile`).
 * @param {Array<{isOpen:boolean, close:()=>void}>} overlays  Ordered by
 *        priority — first match wins. e.g. [reader, drawer, settings].
 */
export function useMobileBackButton(enabled, overlays) {
  // The topmost open overlay (pure derivation each render).
  const top = enabled ? (overlays.find((o) => o && o.isOpen) || null) : null

  // Keep the latest closer in a ref so the popstate handler (installed once)
  // always calls the current version without re-subscribing.
  const closerRef = useRef(null)
  closerRef.current = top ? top.close : null

  // Whether WE currently own a pushed history entry. Ref, not state, so it
  // doesn't trigger extra renders.
  const pushedRef = useRef(false)

  const handlePopState = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      const closer = closerRef.current
      closerRef.current = null
      closer?.()
    }
  }, [])

  // Install one popstate listener for the lifetime of this hook.
  useEffect(() => {
    if (!enabled) return
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [enabled, handlePopState])

  // Push/pop a single sentinel history entry based on whether any overlay is
  // open. `top` identity changes whenever React re-renders with a new overlay
  // object, so we key on the derived boolean `!!top` instead to avoid churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (top && !pushedRef.current) {
      // An overlay just opened — install a sentinel entry so the next back
      // press lands on popstate instead of navigating away from the PWA.
      history.pushState({ mmOverlay: true }, '')
      pushedRef.current = true
    } else if (!top && pushedRef.current) {
      // The overlay closed via its own close button (not back) — we still own
      // a pushed entry, so balance the history stack.
      pushedRef.current = false
      history.back()
    }
  }, [!!top])

  // When we switch out of mobile (enabled=false) or unmount, release any
  // history entry we still own so the browser history stays clean.
  useEffect(() => {
    return () => {
      if (pushedRef.current) {
        pushedRef.current = false
        history.back()
      }
    }
  }, [])
}
