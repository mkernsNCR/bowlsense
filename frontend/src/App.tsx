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

  const mobileNav = [
    { path: '/', mobileLabel: 'Home', icon: '🎳' },
    { path: '/quick', mobileLabel: 'Quick', icon: '⚡' },
    { path: '/quick-score', mobileLabel: 'Score', icon: '🎯' },
    { path: '/sessions', mobileLabel: 'Sessions', icon: '📋' },
    { path: '/sessions/new', mobileLabel: 'New', icon: '➕' },
    { path: '/leagues', mobileLabel: 'Leagues', icon: '🏆' },
    { path: '/pin-leaves', mobileLabel: 'Pin Leaves', icon: '📌' },
    { path: '/score-calculator', mobileLabel: 'Calculator', icon: '🧮' },
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>☰ Menu</span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: 4, lineHeight: 1 }}
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
