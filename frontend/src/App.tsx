import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import CompactTabBar from './features/shell/CompactTabBar'
import MoreSheet from './features/shell/MoreSheet'
import Sidebar from './features/shell/Sidebar'
import ShellIcon from './features/shell/ShellIcon'
import { getShellTitle, isPublicRoute } from './features/shell/navigation'
import './App.css'

interface AppProps {
  children: ReactNode
  inspector?: ReactNode
}

export default function App({ children, inspector }: AppProps) {
  const { pathname } = useLocation()
  const [moreOpenedAtPath, setMoreOpenedAtPath] = useState<string | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreOpen = moreOpenedAtPath === pathname
  const shellTitle = getShellTitle(pathname)

  const closeMore = useCallback(() => {
    setMoreOpenedAtPath(null)
  }, [])

  const openMore = useCallback(() => {
    setMoreOpenedAtPath(pathname)
  }, [pathname])

  if (isPublicRoute(pathname)) {
    return <main className="bs-shell__public-content">{children}</main>
  }

  return (
    <div className={`bs-shell${inspector ? ' bs-shell--with-inspector' : ''}`}>
      <a className="bs-shell__skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar pathname={pathname} />

      <div className="bs-shell__workspace">
        <header className="bs-shell__toolbar">
          <div className="bs-shell__compact-title">
            <ShellIcon name="lane" size={20} />
            <span>BowlSense</span>
          </div>
          <p className="bs-shell__wide-title">{shellTitle}</p>
        </header>

        <main id="main-content" className="bs-shell__content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {inspector && (
        <aside className="bs-shell__inspector" aria-label="Inspector">
          {inspector}
        </aside>
      )}

      <CompactTabBar
        pathname={pathname}
        moreOpen={moreOpen}
        moreButtonRef={moreButtonRef}
        onMoreOpen={openMore}
      />

      {moreOpen && (
        <MoreSheet
          onClose={closeMore}
        />
      )}
    </div>
  )
}
