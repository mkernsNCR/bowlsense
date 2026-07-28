import type { IconName } from './ShellIcon'

export interface ShellNavItem {
  label: string
  path: string
  icon: IconName
}

export interface ShellNavGroup {
  label: string
  items: ShellNavItem[]
}

export const sidebarGroups: ShellNavGroup[] = [
  {
    label: 'Getting started',
    items: [
      { label: 'Today', path: '/', icon: 'today' },
      { label: 'Quick Start', path: '/quick', icon: 'quick' },
    ],
  },
  {
    label: 'Tracking',
    items: [
      { label: 'Sessions', path: '/sessions', icon: 'sessions' },
      { label: 'Leagues', path: '/leagues', icon: 'league' },
      { label: 'Tournaments', path: '/tournaments', icon: 'tournament' },
    ],
  },
  {
    label: 'Gear',
    items: [
      { label: 'Balls', path: '/balls', icon: 'ball' },
      { label: 'Arsenals', path: '/arsenals', icon: 'arsenal' },
    ],
  },
  {
    label: 'Achievements',
    items: [{ label: '300 Club', path: '/perfect-games', icon: 'achievement' }],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Statistics', path: '/stats', icon: 'insights' },
      { label: 'Pin Leaves', path: '/pin-leaves', icon: 'pin-leave' },
    ],
  },
  {
    label: 'Tools',
    items: [{ label: 'Score Calculator', path: '/score-calculator', icon: 'calculator' }],
  },
  {
    label: 'Support',
    items: [
      { label: 'Settings', path: '/settings', icon: 'settings' },
      { label: 'Help', path: '/help', icon: 'help' },
    ],
  },
]

export const moreGroups: ShellNavGroup[] = [
  {
    label: 'Competition',
    items: [
      { label: 'Leagues', path: '/leagues', icon: 'league' },
      { label: 'Tournaments', path: '/tournaments', icon: 'tournament' },
    ],
  },
  {
    label: 'Gear',
    items: [
      { label: 'Balls', path: '/balls', icon: 'ball' },
      { label: 'Arsenals', path: '/arsenals', icon: 'arsenal' },
    ],
  },
  {
    label: 'Achievements',
    items: [{ label: '300 Club', path: '/perfect-games', icon: 'achievement' }],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Quick Start', path: '/quick', icon: 'quick' },
      { label: 'Score Calculator', path: '/score-calculator', icon: 'calculator' },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { label: 'Settings', path: '/settings', icon: 'settings' },
      { label: 'Help', path: '/help', icon: 'help' },
    ],
  },
]

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

export function isItemActive(pathname: string, path: string) {
  pathname = normalizePath(pathname)
  if (path === '/') return pathname === '/'
  if (path === '/sessions') {
    return pathname === '/sessions' || (/^\/sessions\/[^/]+\/?$/.test(pathname) && pathname !== '/sessions/new')
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function isSessionsTabActive(pathname: string) {
  pathname = normalizePath(pathname)
  return pathname === '/sessions' || (/^\/sessions\/[^/]+\/?$/.test(pathname) && pathname !== '/sessions/new')
}

export function isInsightsTabActive(pathname: string) {
  pathname = normalizePath(pathname)
  return pathname === '/stats' || pathname.startsWith('/stats/') || pathname === '/pin-leaves'
}

export function isMoreTabActive(pathname: string) {
  pathname = normalizePath(pathname)
  return pathname !== '/'
    && !isSessionsTabActive(pathname)
    && pathname !== '/sessions/new'
    && !isInsightsTabActive(pathname)
}

export function isPublicRoute(pathname: string) {
  pathname = normalizePath(pathname)
  return pathname === '/bowl'
    || /^\/score\/[^/]+\/?$/.test(pathname)
    || /^\/sessions\/[^/]+\/share\/?$/.test(pathname)
    || /^\/perfect-games\/[^/]+\/?$/.test(pathname)
    || /^\/leagues\/[^/]+\/(public|leaderboard|share)\/?$/.test(pathname)
    || /^\/leagues\/[^/]+\/recap\/share\/?$/.test(pathname)
    || /^\/leagues\/[^/]+\/week\/[^/]+\/share\/?$/.test(pathname)
    || /^\/tournaments\/[^/]+\/share\/?$/.test(pathname)
    || /^\/tournaments\/[^/]+\/standings\/?$/.test(pathname)
    || /^\/tournaments\/[^/]+\/standings\/share\/?$/.test(pathname)
}
