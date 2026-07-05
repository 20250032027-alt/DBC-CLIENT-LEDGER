import { useState, useEffect } from 'react'

// Tracks whether the viewport is narrower than `breakpoint` (default: phone
// width). Used for the handful of places that need a real numeric value
// (chart dimensions, SVG props) rather than something CSS media queries
// alone can handle.
export function useIsMobile(breakpoint = 480) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  )

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < breakpoint) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])

  return isMobile
}
