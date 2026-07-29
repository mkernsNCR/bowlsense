import { useId, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface GroupedListProps {
  children: ReactNode
  title?: ReactNode
  footer?: ReactNode
  ariaLabel?: string
  className?: string
}

export function GroupedList({ children, title, footer, ariaLabel, className = '' }: GroupedListProps) {
  const titleId = useId()
  return (
    <section className={`bs-group ${className}`.trim()} aria-label={ariaLabel} aria-labelledby={!ariaLabel && title ? titleId : undefined}>
      {title ? <h2 className="bs-group__title" id={titleId}>{title}</h2> : null}
      <div className="bs-group__list">{children}</div>
      {footer ? <p className="bs-group__footer">{footer}</p> : null}
    </section>
  )
}

interface ListRowBaseProps {
  label: ReactNode
  detail?: ReactNode
  value?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  selected?: boolean
  disabled?: boolean
  className?: string
  accessibilityLabel?: string
}

export type ListRowProps = ListRowBaseProps & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
  | { href?: never; onClick?: never }
)

export function ListRow({
  label,
  detail,
  value,
  leading,
  trailing,
  selected = false,
  disabled = false,
  className = '',
  accessibilityLabel,
  ...action
}: ListRowProps) {
  const content = (
    <>
      {leading ? <span className="bs-list-row__leading">{leading}</span> : null}
      <span className="bs-list-row__body">
        <span className="bs-list-row__label">{label}</span>
        {detail ? <span className="bs-list-row__detail">{detail}</span> : null}
      </span>
      {value ? <span className="bs-list-row__value">{value}</span> : null}
      {selected ? <Icon name="check" className="bs-list-row__check" label="Selected" size={18} /> : null}
      {trailing ?? (('href' in action && action.href) || ('onClick' in action && action.onClick) ? <Icon name="chevron-right" size={17} /> : null)}
    </>
  )
  const classes = `bs-list-row${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`

  if ('href' in action && action.href) {
    return <a className={classes} href={disabled ? undefined : action.href} tabIndex={disabled ? -1 : undefined} aria-label={accessibilityLabel} aria-disabled={disabled || undefined}>{content}</a>
  }
  if ('onClick' in action && action.onClick) {
    return <button className={classes} type="button" onClick={action.onClick} disabled={disabled} aria-label={accessibilityLabel}>{content}</button>
  }
  return <div className={classes} aria-label={accessibilityLabel}>{content}</div>
}
