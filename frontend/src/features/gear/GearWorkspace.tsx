import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Icon, Sheet } from '../../design'
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
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeLabel={`Close ${title}`}
      className="gear-sheet-theme gear-sheet-panel"
    >
      {children}
    </Sheet>
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
  return <Link className="gear-back" to={to}><Icon name="back" size={17} />{children}</Link>
}
