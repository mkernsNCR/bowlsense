import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Sheet } from '../../design'
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
  const navigate = useNavigate()
  const handleClose = onClose ?? (() => navigate(closeTo))

  return (
    <Sheet
      open
      onClose={handleClose}
      title={title}
      description="Competition details"
      closeLabel={`Close ${title}`}
      className="competition-sheet-panel"
    >
      {children}
    </Sheet>
  )
}

export function CompetitionArchiveSheet({
  area,
  id,
  active,
  onClose,
  mutation,
}: {
  area: CompetitionArea
  id: string
  active: number
  onClose: () => void
  mutation: { isPending: boolean; isError: boolean; mutate: (restore: boolean) => void }
}) {
  const restoring = active === 0
  const singular = area === 'leagues' ? 'league' : 'tournament'
  const preserved = area === 'leagues' ? 'weeks and games' : 'games and results'

  return (
    <CompetitionSheet
      title={`${restoring ? 'Restore' : 'Archive'} ${singular}?`}
      closeTo={`/${area}/${id}`}
      onClose={onClose}
    >
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0 }}>
          {restoring
            ? `This ${singular} will return to your active ${area === 'leagues' ? 'leagues' : 'schedule'}. All ${preserved} are already preserved.`
            : `This ${singular} will move out of your active ${area === 'leagues' ? 'list' : 'schedule'}. All ${preserved} will be preserved, and you can restore it later.`}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={restoring ? 'btn btn-primary' : 'btn btn-danger'}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(restoring)}
          >
            {mutation.isPending ? 'Saving…' : `${restoring ? 'Restore' : 'Archive'} ${singular}`}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
        {mutation.isError && <div role="alert" style={{ color: 'var(--danger)' }}>Could not update this {singular}. Please try again.</div>}
      </div>
    </CompetitionSheet>
  )
}

interface PublicFact {
  label: string
  value: ReactNode
}

export function PublicResult({ score, label, accessibleLabel, facts }: {
  score: ReactNode
  label: string
  accessibleLabel: string
  facts: PublicFact[]
}) {
  return (
    <div className="share-result">
      <section className="share-result__primary" aria-label={accessibleLabel}>
        <div><div className="share-result__score">{score}</div><div className="share-result__label">{label}</div></div>
      </section>
      <dl className="share-result__facts">
        {facts.map((fact) => <div className="share-result__fact" key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
      </dl>
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
    <div className="public-scorecard">
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
    </div>
  )
}
