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

const navItems = {
  today: { label: 'Today', path: '/', icon: 'today' },
  quickStart: { label: 'Quick Start', path: '/quick', icon: 'quick' },
  sessions: { label: 'Sessions', path: '/sessions', icon: 'sessions' },
  leagues: { label: 'Leagues', path: '/leagues', icon: 'league' },
  tournaments: { label: 'Tournaments', path: '/tournaments', icon: 'tournament' },
  balls: { label: 'Balls', path: '/balls', icon: 'ball' },
  arsenals: { label: 'Arsenals', path: '/arsenals', icon: 'arsenal' },
  perfectGames: { label: '300 Club', path: '/perfect-games', icon: 'achievement' },
  statistics: { label: 'Statistics', path: '/stats', icon: 'insights' },
  pinLeaves: { label: 'Pin Leaves', path: '/pin-leaves', icon: 'pin-leave' },
  scoreCalculator: { label: 'Score Calculator', path: '/score-calculator', icon: 'calculator' },
  settings: { label: 'Settings', path: '/settings', icon: 'settings' },
  help: { label: 'Help', path: '/help', icon: 'help' },
} satisfies Record<string, ShellNavItem>

export const sidebarGroups: ShellNavGroup[] = [
  {
    label: 'Getting started',
    items: [navItems.today, navItems.quickStart],
  },
  {
    label: 'Tracking',
    items: [navItems.sessions, navItems.leagues, navItems.tournaments],
  },
  {
    label: 'Gear',
    items: [navItems.balls, navItems.arsenals],
  },
  {
    label: 'Achievements',
    items: [navItems.perfectGames],
  },
  {
    label: 'Insights',
    items: [navItems.statistics, navItems.pinLeaves],
  },
  {
    label: 'Tools',
    items: [navItems.scoreCalculator],
  },
  {
    label: 'Support',
    items: [navItems.settings, navItems.help],
  },
]

export const moreGroups: ShellNavGroup[] = [
  {
    label: 'Competition',
    items: [navItems.leagues, navItems.tournaments],
  },
  {
    label: 'Gear',
    items: [navItems.balls, navItems.arsenals],
  },
  {
    label: 'Achievements',
    items: [navItems.perfectGames],
  },
  {
    label: 'Tools',
    items: [navItems.quickStart, navItems.scoreCalculator],
  },
  {
    label: 'Preferences',
    items: [navItems.settings, navItems.help],
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
  return isItemActive(pathname, navItems.sessions.path)
}

export function isInsightsTabActive(pathname: string) {
  return isItemActive(pathname, navItems.statistics.path)
    || isItemActive(pathname, navItems.pinLeaves.path)
    || isItemActive(pathname, navItems.scoreCalculator.path)
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
    || /^\/score\/\d+\/?$/.test(pathname)
    || /^\/sessions\/\d+\/share\/?$/.test(pathname)
    || /^\/perfect-games\/\d+\/?$/.test(pathname)
    || /^\/leagues\/\d+\/(public|leaderboard|share)\/?$/.test(pathname)
    || /^\/leagues\/\d+\/recap\/share\/?$/.test(pathname)
    || /^\/leagues\/\d+\/week\/\d+\/share\/?$/.test(pathname)
    || /^\/tournaments\/\d+\/share\/?$/.test(pathname)
    || /^\/tournaments\/\d+\/standings\/?$/.test(pathname)
    || /^\/tournaments\/\d+\/standings\/share\/?$/.test(pathname)
}

export function getShellTitle(pathname: string) {
  if (isItemActive(pathname, '/sessions/new')) return 'Start session'

  const activeItem = sidebarGroups
    .flatMap((group) => group.items)
    .find((item) => isItemActive(pathname, item.path))

  return activeItem?.label ?? 'BowlSense'
}
