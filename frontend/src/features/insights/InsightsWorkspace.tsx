import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import './insights.css'

const sections = [
  { label: 'Snapshot', to: '/stats' },
  { label: 'Pin practice', to: '/pin-leaves' },
  { label: 'Calculator', to: '/score-calculator' },
]

interface InsightsWorkspaceProps {
  children: ReactNode
  description: string
}

export function InsightsWorkspace({ children, description }: InsightsWorkspaceProps) {
  return (
    <div className="insights-workspace">
      <header className="insights-header">
        <p className="insights-eyebrow">Lane intelligence</p>
        <h1>Insights</h1>
        <p>{description}</p>
      </header>

      <nav className="insights-segments" aria-label="Insights sections">
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            end
            className={({ isActive }) => isActive ? 'insights-segment is-active' : 'insights-segment'}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>

      {children}
    </div>
  )
}

interface InsightStateProps {
  action?: ReactNode
  children: ReactNode
  title: string
  tone?: 'default' | 'error'
}

export function InsightState({ action, children, title, tone = 'default' }: InsightStateProps) {
  return (
    <section className={`insights-state${tone === 'error' ? ' is-error' : ''}`} aria-live="polite">
      <span className="insights-state-mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  )
}

interface LeadTakeawayProps {
  children: ReactNode
  detail: string
  label?: string
}

export function LeadTakeaway({ children, detail, label = 'Read on your game' }: LeadTakeawayProps) {
  return (
    <section className="insights-takeaway">
      <div>
        <p className="insights-kicker">{label}</p>
        <h2>{children}</h2>
      </div>
      <p className="insights-takeaway-detail">{detail}</p>
    </section>
  )
}

interface MetricProps {
  label: string
  value: ReactNode
  note?: string
}

export function InsightMetric({ label, value, note }: MetricProps) {
  return (
    <div className="insights-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}
