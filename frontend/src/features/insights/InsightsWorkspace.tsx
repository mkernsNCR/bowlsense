import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { EmptyState, Metric } from '../../design'
import './insights.css'

const sections = [
  { label: 'Form', to: '/stats' },
  { label: 'Pin leaves', to: '/pin-leaves' },
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
  status?: 'empty' | 'loading' | 'error'
  title: string
  tone?: 'default' | 'error'
}

export function InsightState({ action, children, status, title, tone = 'default' }: InsightStateProps) {
  return (
    <EmptyState
      action={action}
      className="insights-state"
      description={children}
      status={status ?? (tone === 'error' ? 'error' : 'empty')}
      title={title}
    />
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
  return <Metric className="insights-metric" detail={note} label={label} value={value} />
}
