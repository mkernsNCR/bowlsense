import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import ShellIcon, { type IconName } from './ShellIcon'
import { isInsightsTabActive, isMoreTabActive, isSessionsTabActive } from './navigation'

interface CompactTabBarProps {
  pathname: string
  moreOpen: boolean
  moreButtonRef: RefObject<HTMLButtonElement | null>
  onMoreOpen: () => void
}

interface TabLinkProps {
  active: boolean
  icon: IconName
  label: string
  path: string
  prominent?: boolean
}

function TabLink({ active, icon, label, path, prominent = false }: TabLinkProps) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={`bs-shell__tab${prominent ? ' bs-shell__tab--start' : ''}`}
      to={path}
    >
      <span className="bs-shell__tab-icon"><ShellIcon name={icon} /></span>
      <span>{label}</span>
    </Link>
  )
}

export default function CompactTabBar({ pathname, moreOpen, moreButtonRef, onMoreOpen }: CompactTabBarProps) {
  return (
    <nav className="bottom-nav bs-shell__tab-bar" aria-label="Primary navigation">
      <TabLink active={pathname === '/'} icon="today" label="Today" path="/" />
      <TabLink active={isSessionsTabActive(pathname)} icon="sessions" label="Sessions" path="/sessions" />
      <TabLink active={pathname === '/sessions/new'} icon="start" label="Start" path="/sessions/new" prominent />
      <TabLink active={isInsightsTabActive(pathname)} icon="insights" label="Insights" path="/stats" />
      <button
        ref={moreButtonRef}
        type="button"
        className="bs-shell__tab"
        aria-label="More navigation"
        aria-controls="bs-more-sheet"
        aria-expanded={moreOpen}
        aria-current={isMoreTabActive(pathname) ? 'page' : undefined}
        onClick={onMoreOpen}
      >
        <span className="bs-shell__tab-icon"><ShellIcon name="more" /></span>
        <span>More</span>
      </button>
    </nav>
  )
}
