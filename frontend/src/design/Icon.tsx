import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'today'
  | 'sessions'
  | 'start'
  | 'insights'
  | 'more'
  | 'profile'
  | 'back'
  | 'close'
  | 'chevron-right'
  | 'check'
  | 'plus'
  | 'calendar'
  | 'location'
  | 'bowling-ball'
  | 'bag'
  | 'league'
  | 'tournament'
  | 'trophy'
  | 'pin'
  | 'calculator'
  | 'settings'
  | 'help'
  | 'share'
  | 'edit'
  | 'trash'
  | 'search'
  | 'warning'
  | 'error'
  | 'empty'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  name: IconName
  label?: string
  size?: number | string
}

const paths: Record<IconName, ReactNode> = {
  today: <><path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5M9.5 20v-6h5v6"/></>,
  sessions: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  start: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
  insights: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 7 4-4"/></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  back: <path d="m15 18-6-6 6-6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  'chevron-right': <path d="m9 6 6 6-6 6"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  'bowling-ball': <><circle cx="12" cy="12" r="9"/><circle cx="10" cy="7.5" r=".8" fill="currentColor" stroke="none"/><circle cx="13.5" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r=".8" fill="currentColor" stroke="none"/></>,
  bag: <><path d="M5 9h14l1 12H4L5 9Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
  league: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/></>,
  tournament: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM9 16h6v5H9zM7 10v3h10v-3M12 13v3"/></>,
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4M12 13v5M8 21h8"/></>,
  pin: <><path d="M9.5 3h5l-1 5c0 2 3 4 3 8a4.5 4.5 0 0 1-9 0c0-4 3-6 3-8l-1-5Z"/><path d="M9.5 9h5"/></>,
  calculator: <><rect x="4" y="2.5" width="16" height="19" rx="3"/><path d="M7 6h10v3H7zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4 2c-1.2.8-1.7 1.3-1.7 2.5M12 17h.01"/></>,
  share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></>,
  edit: <><path d="m14 5 5 5L9 20l-6 1 1-6L14 5Z"/><path d="m12 7 5 5"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  warning: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
  error: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
  empty: <><path d="M4 8h16v11H4zM7 8l2-4h6l2 4"/><path d="M9 13h6"/></>,
}

export function Icon({ name, label, size = '1em', className = '', ...props }: IconProps) {
  return (
    <svg
      className={`bs-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {label ? <title>{label}</title> : null}
      {paths[name]}
    </svg>
  )
}
