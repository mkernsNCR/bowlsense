import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

export interface LargeTitleProps {
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  trailing?: ReactNode
  className?: string
  id?: string
}

export function LargeTitle({ title, subtitle, eyebrow, trailing, className = '', id }: LargeTitleProps) {
  return (
    <header className={`bs-large-title ${className}`.trim()}>
      <div className="bs-large-title__copy">
        {eyebrow ? <p className="bs-large-title__eyebrow">{eyebrow}</p> : null}
        <h1 id={id}>{title}</h1>
        {subtitle ? <p className="bs-large-title__subtitle">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="bs-large-title__trailing">{trailing}</div> : null}
    </header>
  )
}

export interface NavigationBarProps {
  title?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  ariaLabel?: string
  className?: string
}

export function NavigationBar({ title, leading, trailing, ariaLabel = 'Page navigation', className = '' }: NavigationBarProps) {
  return (
    <header className={`bs-navigation-bar ${className}`.trim()}>
      <nav className="bs-navigation-bar__content" aria-label={ariaLabel}>
        <div className="bs-navigation-bar__edge">{leading}</div>
        <div className="bs-navigation-bar__title">{title}</div>
        <div className="bs-navigation-bar__edge bs-navigation-bar__edge--trailing">{trailing}</div>
      </nav>
    </header>
  )
}

export interface TabBarItem {
  label: string
  path: string
  icon: IconName
  end?: boolean
  emphasized?: boolean
}

export interface TabBarProps {
  items: readonly TabBarItem[]
  ariaLabel?: string
  className?: string
}

export function TabBar({ items, ariaLabel = 'Primary navigation', className = '' }: TabBarProps) {
  if (items.length > 5) {
    throw new Error('TabBar supports at most five destinations.')
  }

  return (
    <nav className={`bs-tab-bar ${className}`.trim()} aria-label={ariaLabel}>
      <div className="bs-tab-bar__items">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end ?? item.path === '/'}
            className={({ isActive }) => `bs-tab-bar__item${isActive ? ' is-active' : ''}${item.emphasized ? ' is-emphasized' : ''}`}
          >
            <span className="bs-tab-bar__icon" aria-hidden="true"><Icon name={item.icon} size={22} /></span>
            <span className="bs-tab-bar__label">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
