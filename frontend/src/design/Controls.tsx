import { useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type ButtonBaseProps = {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive'
  size?: 'regular' | 'compact'
  fullWidth?: boolean
  icon?: IconName
  iconPosition?: 'start' | 'end'
}

export type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never }
export type ButtonLinkProps = ButtonBaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; disabled?: boolean }

export function Button(props: ButtonProps | ButtonLinkProps) {
  const {
    children,
    variant = 'primary',
    size = 'regular',
    fullWidth = false,
    icon,
    iconPosition = 'start',
    className = '',
    ...elementProps
  } = props
  const classes = `bs-button bs-button--${variant} bs-button--${size}${fullWidth ? ' bs-button--full' : ''}${className ? ` ${className}` : ''}`
  const content = <>{icon && iconPosition === 'start' ? <Icon name={icon} size={19} /> : null}<span>{children}</span>{icon && iconPosition === 'end' ? <Icon name={icon} size={19} /> : null}</>

  if ('href' in elementProps && typeof elementProps.href === 'string') {
    const { href, disabled, onClick, ...anchorProps } = elementProps as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; disabled?: boolean }
    return (
      <a
        {...anchorProps}
        href={disabled ? undefined : href}
        className={classes}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : anchorProps.tabIndex}
        onClick={disabled ? (event) => event.preventDefault() : onClick}
      >
        {content}
      </a>
    )
  }

  const { type = 'button', ...buttonProps } = elementProps as ButtonHTMLAttributes<HTMLButtonElement>
  return <button {...buttonProps} type={type} className={classes}>{content}</button>
}

export interface SegmentOption<Value extends string> {
  value: Value
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps<Value extends string> {
  label: string
  options: readonly SegmentOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  className?: string
}

export function SegmentedControl<Value extends string>({ label, options, value, onChange, className = '' }: SegmentedControlProps<Value>) {
  const id = useId()
  return (
    <fieldset className={`bs-segmented ${className}`.trim()}>
      <legend className="bs-visually-hidden">{label}</legend>
      {options.map((option) => (
        <label className="bs-segmented__option" key={option.value}>
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
