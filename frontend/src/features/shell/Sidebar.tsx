import { Link } from 'react-router-dom'
import ShellIcon from './ShellIcon'
import { isItemActive, sidebarGroups } from './navigation'

interface SidebarProps {
  pathname: string
}

export default function Sidebar({ pathname }: SidebarProps) {
  return (
    <aside className="bs-shell__sidebar">
      <Link className="bs-shell__brand" to="/" aria-label="BowlSense Today">
        <span className="bs-shell__brand-mark"><ShellIcon name="lane" size={22} /></span>
        <span>BowlSense</span>
      </Link>

      <Link
        className="bs-shell__start-link"
        to="/sessions/new"
        aria-current={isItemActive(pathname, '/sessions/new') ? 'page' : undefined}
      >
        <ShellIcon name="start" size={19} />
        <span>Start session</span>
      </Link>

      <nav className="bs-shell__sidebar-nav" aria-label="Primary navigation">
        {sidebarGroups.map((group) => (
          <section key={group.label} aria-labelledby={`sidebar-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
            <h2 className="bs-shell__sidebar-group-title" id={`sidebar-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
              {group.label}
            </h2>
            {group.items.map((item) => {
              const active = isItemActive(pathname, item.path)
              return (
                <Link
                  key={item.path}
                  className="bs-shell__sidebar-link"
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                >
                  <ShellIcon name={item.icon} size={19} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </section>
        ))}
      </nav>
    </aside>
  )
}
