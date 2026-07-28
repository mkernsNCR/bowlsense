import { type ReactNode, useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import CompactTabBar from './features/shell/CompactTabBar'
import MoreSheet from './features/shell/MoreSheet'
import Sidebar from './features/shell/Sidebar'
import ShellIcon from './features/shell/ShellIcon'
import { isPublicRoute } from './features/shell/navigation'
import './App.css'

export default function App({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [moreOpenedAtPath, setMoreOpenedAtPath] = useState<string | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreOpen = moreOpenedAtPath === pathname

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
    <div className="bs-shell">
      <a className="bs-shell__skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar pathname={pathname} />

      <div className="bs-shell__workspace">
        <header className="bs-shell__toolbar">
          <div className="bs-shell__compact-brand" aria-hidden="true">
            <ShellIcon name="lane" size={20} />
            <span>BowlSense</span>
          </div>
        </header>

        <main id="main-content" className="bs-shell__content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <CompactTabBar
        pathname={pathname}
        moreOpen={moreOpen}
        moreButtonRef={moreButtonRef}
        onMoreOpen={openMore}
      />

      {moreOpen && (
        <MoreSheet
          onClose={closeMore}
          restoreFocusRef={moreButtonRef}
        />
      )}
    </div>
  )
}
