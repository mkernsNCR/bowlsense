import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface MetricProps {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  trend?: { direction: 'up' | 'down' | 'steady'; label: string }
  tone?: 'neutral' | 'highlight' | 'positive'
  className?: string
}

export function Metric({ label, value, detail, trend, tone = 'neutral', className = '' }: MetricProps) {
  return (
    <div className={`bs-metric bs-metric--${tone} ${className}`.trim()}>
      <span className="bs-metric__label">{label}</span>
      <strong className="bs-metric__value">{value}</strong>
      {trend ? (
        <span className="bs-metric__trend">
          <span aria-hidden="true">{trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'}</span>
          {trend.label}
        </span>
      ) : detail ? <span className="bs-metric__detail">{detail}</span> : null}
    </div>
  )
}

export interface EmptyStateProps {
  title: ReactNode
  description: ReactNode
  action?: ReactNode
  icon?: IconName
  status?: 'empty' | 'loading' | 'error'
  className?: string
}

export function EmptyState({ title, description, action, icon, status = 'empty', className = '' }: EmptyStateProps) {
  const resolvedIcon = icon ?? (status === 'error' ? 'error' : status === 'loading' ? 'bowling-ball' : 'empty')
  return (
    <section
      className={`bs-empty-state bs-empty-state--${status} ${className}`.trim()}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'loading' ? 'polite' : undefined}
      aria-busy={status === 'loading' || undefined}
    >
      <span className="bs-empty-state__icon" aria-hidden="true"><Icon name={resolvedIcon} size={28} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="bs-empty-state__action">{action}</div> : null}
    </section>
  )
}
