import { useEffect, useState } from 'react'

const MOBILE_BP = 768

/**
 * Returns `true` when the viewport is narrower than 768px (i.e. a phone or
 * small tablet in portrait). Uses `matchMedia` so it reacts to live resize
 * without a scroll/resize listener.
 */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BP : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`)
    const handler = (e) => setMobile(e.matches)
    q.addEventListener('change', handler)
    return () => q.removeEventListener('change', handler)
  }, [])
  return mobile
}
