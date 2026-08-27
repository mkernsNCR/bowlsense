import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function App({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const desktopNav = [
    { path: '/', mobileLabel: 'Home', desktopLabel: 'Dashboard', icon: '🎳', section: 'Getting Started' },
    { path: '/quick', mobileLabel: 'Quick', desktopLabel: 'Quick Start', icon: '⚡', section: 'Getting Started' },
    { path: '/quick-score', mobileLabel: 'Score', desktopLabel: 'Quick Score', icon: '🎯', section: 'Getting Started' },
    { path: '/sessions', mobileLabel: 'Sessions', desktopLabel: 'Sessions', icon: '📋', section: 'Tracking' },
    { path: '/leagues', mobileLabel: 'Leagues', desktopLabel: 'Leagues', icon: '🏆', section: 'Tracking' },
    { path: '/tournaments', mobileLabel: 'Events', desktopLabel: 'Tournaments', icon: '🎯', section: 'Tracking' },
    { path: '/balls', mobileLabel: 'Balls', desktopLabel: 'My Balls', icon: '🎱', section: 'Gear' },
    { path: '/arsenals', mobileLabel: 'Arsenals', desktopLabel: 'Arsenals', icon: '🎒', section: 'Gear' },
    { path: '/perfect-games', mobileLabel: '300 Club', desktopLabel: '300 Club', icon: '🏅', section: 'Achievements' },
    { path: '/pin-leaves', mobileLabel: 'Pin Leaves', desktopLabel: 'Pin Leaves', icon: '📌', section: 'Insights' },
    { path: '/stats', mobileLabel: 'Stats', desktopLabel: 'Statistics', icon: '📊', section: 'Insights' },
    { path: '/score-calculator', mobileLabel: 'Calculator', desktopLabel: 'Score Calculator', icon: '🧮', section: 'Tools' },
    { path: '/settings', mobileLabel: 'More', desktopLabel: 'Settings', icon: '⚙️', section: 'Support' },
    { path: '/help', mobileLabel: 'Help', desktopLabel: 'Help', icon: '❓', section: 'Support' },
  ]

  // Bottom nav is intentionally minimal (4 items + Menu trigger).
  // 5 items at 375px width = ~70px tap targets. 6+ items made the nav
  // wrap to 2 rows (140px tall, half the screen) on small phones.
  // Everything else lives in the drawer, one tap away via the Menu button.
  const mobileNav = [
    { path: '/', mobileLabel: 'Home', icon: '🎳' },
    { path: '/quick-score', mobileLabel: 'Score', icon: '🎯' },
    { path: '/sessions/new', mobileLabel: 'Log', icon: '➕' },
    { path: '/leagues', mobileLabel: 'Leagues', icon: '🏆' },
  ]

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  // Escape key closes the drawer (works on keyboard + virtual keyboard focus)
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', width: '100%', overflowX: 'hidden' }}>
      <header className="app-header">
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
          <Link to="/" style={{ fontWeight: 750, fontSize: 18, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, textDecoration: 'none' }}>
            <span>🎳</span>
            <span className="logo-text">BowlSense</span>
          </Link>

          <button
            className="hamburger-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
          >
            ☰
          </button>

          <nav className="top-nav">
            {desktopNav.map((n) => {
              const active = n.path === '/' ? location.pathname === '/' : location.pathname === n.path || location.pathname.startsWith(`${n.path}/`)
              return (
                <Link key={n.path} to={n.path} className={`top-nav-link ${active ? 'active' : ''}`}>
                  {n.icon} {n.desktopLabel}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      {drawerOpen && (
        <div className="nav-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div id="mobile-nav-drawer" className="nav-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>☰ Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, minWidth: 36, minHeight: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav style={{ padding: '8px 0', overflowY: 'auto', flex: 1 }}>
              {(() => {
                const sections = [
                  { label: 'Getting Started', items: desktopNav.filter(n => n.section === 'Getting Started') },
                  { label: 'Tracking', items: desktopNav.filter(n => n.section === 'Tracking') },
                  { label: 'Gear', items: desktopNav.filter(n => n.section === 'Gear') },
                  { label: 'Achievements', items: desktopNav.filter(n => n.section === 'Achievements') },
                  { label: 'Insights', items: desktopNav.filter(n => n.section === 'Insights') },
                  { label: 'Support', items: desktopNav.filter(n => n.section === 'Support') },
                ]
                return sections.filter(s => s.items.length > 0).map(section => (
                  <div key={section.label} className="nav-drawer-section">
                    <div style={{ padding: '8px 16px 4px', color: 'var(--muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {section.label}
                    </div>
                    {section.items.map(n => {
                      const active = n.path === '/' ? location.pathname === '/' : location.pathname === n.path || location.pathname.startsWith(`${n.path}/`)
                      return (
                        <Link
                          key={n.path}
                          to={n.path}
                          className={`nav-drawer-item ${active ? 'active' : ''}`}
                          onClick={() => setDrawerOpen(false)}
                        >
                          <span style={{ fontSize: 16 }}>{n.icon}</span>
                          <span>{n.desktopLabel}</span>
                        </Link>
                      )
                    })}
                  </div>
                ))
              })()}
            </nav>
          </div>
        </div>
      )}

      <main className="app-main">
        <div className="desktop-only" style={{ height: 8 }} />
        {children}
      </main>

      <nav className="bottom-nav">
        {mobileNav.map((n) => {
          const active = n.path === '/' ? location.pathname === '/' : location.pathname === n.path || location.pathname.startsWith(`${n.path}/`)
          return (
            <Link key={n.path} to={n.path} className={`bottom-nav-item ${active ? 'active' : ''}`}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              <span>{n.mobileLabel}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className={`bottom-nav-item ${drawerOpen ? 'active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open full menu"
        >
          <span style={{ fontSize: 16 }}>☰</span>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}
