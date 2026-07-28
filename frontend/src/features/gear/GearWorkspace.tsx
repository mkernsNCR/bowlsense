import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import './gear.css'

export function GearNavigation() {
  return (
    <nav className="gear-segments" aria-label="Gear sections">
      <NavLink to="/balls" className={({ isActive }) => isActive ? 'gear-segment is-active' : 'gear-segment'}>
        Ball library
      </NavLink>
      <NavLink to="/arsenals" className={({ isActive }) => isActive ? 'gear-segment is-active' : 'gear-segment'}>
        Arsenals
      </NavLink>
    </nav>
  )
}

export function GearHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className="gear-header">
      <div>
        <p className="gear-eyebrow">Gear</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="gear-header__action">{action}</div>}
    </header>
  )
}

export function GearSheet({ open, title, description, onClose, children }: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const closeSheet = useEffectEvent(onClose)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet()
      if (event.key !== 'Tab') return
      const sheet = closeRef.current?.closest('[role="dialog"]')
      const focusable = sheet?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="gear-sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="gear-sheet" role="dialog" aria-modal="true" aria-labelledby="gear-sheet-title" aria-describedby={description ? 'gear-sheet-description' : undefined}>
        <div className="gear-sheet__handle" aria-hidden="true" />
        <header className="gear-sheet__header">
          <div>
            <h2 id="gear-sheet-title">{title}</h2>
            {description && <p id="gear-sheet-description">{description}</p>}
          </div>
          <button ref={closeRef} className="gear-icon-button" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="gear-sheet__body">{children}</div>
      </section>
    </div>
  )
}

export function BallImage({ path, name, size = 'medium' }: { path?: string | null; name: string; size?: 'small' | 'medium' | 'large' }) {
  const [failed, setFailed] = useState(false)
  const source = path?.startsWith('http') ? path : `https://www.bowwwl.com${path || ''}`
  return (
    <div className={`gear-ball-image gear-ball-image--${size}`} title={!path || failed ? `Image unavailable for ${name}` : undefined}>
      {path && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true" />}
      <span className="sr-only">{!path || failed ? `Image unavailable for ${name}` : name}</span>
    </div>
  )
}

export function GearState({ kind, title, detail, action }: {
  kind: 'loading' | 'error' | 'empty'
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <section className={`gear-state gear-state--${kind}`} aria-live="polite">
      <span className="gear-state__mark" aria-hidden="true">{kind === 'loading' ? '···' : kind === 'error' ? '!' : '○'}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  )
}

export function GearBackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="gear-back" to={to}><span aria-hidden="true">←</span>{children}</Link>
}
