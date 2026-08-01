import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { EmptyState, Icon, Sheet } from '../../design'
import './gear.css'

export function GearNavigation() {
  return (
    <nav className="gear-segments" aria-label="Gear sections">
      <NavLink to="/balls" className={({ isActive }) => isActive ? 'gear-segment is-active' : 'gear-segment'}>
        Balls
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
        <p className="gear-eyebrow">{title}</p>
        <h1>Gear</h1>
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
  const source = path?.startsWith('http') ? path : `https://www.bowwwl.com${path || ''}`
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = Boolean(path && failedSource === source)
  return (
    <div className={`gear-ball-image gear-ball-image--${size}`} title={!path || failed ? `Image unavailable for ${name}` : undefined}>
      {path && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)} /> : <span aria-hidden="true" />}
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
    <EmptyState
      status={kind}
      title={title}
      description={detail}
      action={action}
      className={`gear-state gear-state--${kind}`}
    />
  )
}

export function GearBackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="gear-back" to={to}><Icon name="back" size={17} />{children}</Link>
}
