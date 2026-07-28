import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import './competition.css'

type CompetitionArea = 'leagues' | 'tournaments'

export function CompetitionHeader({
  area,
  title,
  detail,
  action,
}: {
  area: CompetitionArea
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <header className="competition-header">
      <div className="competition-header__rail" aria-hidden="true"><span /><span /><span /></div>
      <div className="competition-header__row">
        <div>
          <p className="competition-eyebrow">Competition</p>
          <h1>{title}</h1>
          {detail && <p className="competition-header__detail">{detail}</p>}
        </div>
        {action && <div className="competition-header__action">{action}</div>}
      </div>
      <CompetitionNav active={area} />
    </header>
  )
}

export function CompetitionNav({ active }: { active?: CompetitionArea }) {
  const location = useLocation()
  const selected = active ?? (location.pathname.startsWith('/tournaments') ? 'tournaments' : 'leagues')

  return (
    <nav className="competition-switcher" aria-label="Competition sections">
      <Link to="/leagues" aria-current={selected === 'leagues' ? 'page' : undefined}>Leagues</Link>
      <Link to="/tournaments" aria-current={selected === 'tournaments' ? 'page' : undefined}>Tournaments</Link>
    </nav>
  )
}

export function CompetitionSheet({
  title,
  closeTo,
  onClose,
  children,
}: {
  title: string
  closeTo: string
  onClose?: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (onClose) onClose()
        else navigate(closeTo)
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
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
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [closeTo, navigate, onClose])

  return (
    <div className="competition-sheet" role="dialog" aria-modal="true" aria-labelledby="competition-sheet-title">
      {onClose
        ? <button type="button" className="competition-sheet__backdrop" onClick={onClose} aria-label={`Close ${title}`} />
        : <Link className="competition-sheet__backdrop" to={closeTo} aria-label={`Close ${title}`} />}
      <section ref={panelRef} tabIndex={-1} className="competition-sheet__panel">
        <div className="competition-sheet__handle" aria-hidden="true" />
        <div className="competition-sheet__titlebar">
          <div>
            <p className="competition-eyebrow">Competition details</p>
            <h2 id="competition-sheet-title">{title}</h2>
          </div>
          {onClose
            ? <button type="button" className="competition-icon-button" onClick={onClose} aria-label={`Close ${title}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
            : <Link to={closeTo} className="competition-icon-button" aria-label={`Close ${title}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></Link>}
        </div>
        {children}
      </section>
    </div>
  )
}

export function PublicShell({
  eyebrow,
  title,
  detail,
  action,
  children,
}: {
  eyebrow: string
  title: string
  detail?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="public-scorecard">
      <header className="public-scorecard__header">
        <Link to="/" className="public-scorecard__brand" aria-label="BowlSense home">
          <span className="public-scorecard__mark" aria-hidden="true" />
          BowlSense
        </Link>
        <span className="public-scorecard__read-only">Shared result</span>
      </header>
      <div className="public-scorecard__content">
        <section className="public-scorecard__lead">
          <div>
            <p className="competition-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            {detail && <p>{detail}</p>}
          </div>
          {action && <div className="public-scorecard__action">{action}</div>}
        </section>
        {children}
        <footer className="public-scorecard__footer">Tracked with BowlSense</footer>
      </div>
    </main>
  )
}

export function ActionIcon({ name }: { name: 'add' | 'share' | 'save' | 'close' | 'edit' }) {
  const paths = {
    add: <path d="M12 5v14M5 12h14" />,
    share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.8 7.4-4.5M8.3 13.2l7.4 4.5" /></>,
    save: <><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v6h8V4M8 20v-7h8v7" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    edit: <><path d="m4 20 4.2-1 10.5-10.5-3.2-3.2L5 15.8 4 20Z" /><path d="m13.8 7 3.2 3.2" /></>,
  }
  return <svg className="competition-action-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}
