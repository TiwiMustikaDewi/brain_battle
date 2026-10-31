import { sfx } from './sound'

/**
 * Page-wide interaction effects: a ripple + click sound on every enabled button,
 * and CSS vars (--mx/--my) that let the background glow follow the pointer.
 */
export function installFx() {
  window.addEventListener('pointerdown', (e) => {
    const btn = (e.target as Element | null)?.closest('button')
    if (!btn || btn.disabled || btn.dataset.nofx !== undefined) return
    const r = btn.getBoundingClientRect()
    const size = Math.max(r.width, r.height) * 2
    const dot = document.createElement('span')
    dot.className = 'bb-ripple'
    dot.style.width = dot.style.height = `${size}px`
    dot.style.left = `${e.clientX - r.left - size / 2}px`
    dot.style.top = `${e.clientY - r.top - size / 2}px`
    btn.appendChild(dot)
    dot.addEventListener('animationend', () => dot.remove())
    sfx.click()
  })

  let raf = 0
  window.addEventListener('pointermove', (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      document.documentElement.style.setProperty('--mx', `${e.clientX}px`)
      document.documentElement.style.setProperty('--my', `${e.clientY}px`)
    })
  })
}
