import { useEffect, useState, type ReactNode } from 'react'

const BASE_H = 900
const MIN_W = 1280
const QUERY = '(min-width: 1024px)'

function fit() {
  if (!window.matchMedia(QUERY).matches) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Lay out at 900 logical px tall (at least 1280 wide) and stretch the width to the
  // window's aspect ratio, so the canvas always fills the screen edge to edge.
  const scale = Math.min(vh / BASE_H, vw / MIN_W)
  return { scale, w: vw / scale, h: vh / scale }
}

/**
 * Projector canvas: on large screens the content is laid out on a logical canvas
 * (900 px tall) and scaled to fill the window, so text and layout keep the same
 * proportions on any laptop or projector and nothing is cut off. Small screens
 * get the normal responsive layout.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [box, setBox] = useState(fit)
  useEffect(() => {
    const update = () => setBox(fit())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  if (box === null) return <>{children}</>
  return (
    <div className="fixed inset-0 overflow-hidden">
      <div
        className="relative origin-top-left"
        style={{ width: box.w, height: box.h, transform: `scale(${box.scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
