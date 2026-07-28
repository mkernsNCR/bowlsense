export type IconName =
  | 'achievement'
  | 'arsenal'
  | 'ball'
  | 'calculator'
  | 'chevron'
  | 'close'
  | 'help'
  | 'insights'
  | 'lane'
  | 'league'
  | 'more'
  | 'pin-leave'
  | 'quick'
  | 'sessions'
  | 'settings'
  | 'start'
  | 'today'
  | 'tournament'

interface ShellIconProps {
  name: IconName
  size?: number
}

export default function ShellIcon({ name, size = 22 }: ShellIconProps) {
  const paths = {
    achievement: <><circle cx="12" cy="8" r="5" /><path d="m8.8 12-1.3 8 4.5-2.5 4.5 2.5-1.3-8" /><path d="m10.2 8 1.2 1.2L14 6.7" /></>,
    arsenal: <><path d="M5 9h14l1 11H4L5 9Z" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /><circle cx="9" cy="14" r="1.3" /><circle cx="13" cy="13" r="1.3" /><circle cx="14" cy="16" r="1.3" /></>,
    ball: <><circle cx="12" cy="12" r="9" /><circle cx="10" cy="8" r="1.2" /><circle cx="14" cy="7" r="1.2" /><circle cx="14" cy="11" r="1.2" /></>,
    calculator: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h1m3 0h1m3 0h0M8 15h1m3 0h1m3 0h0M8 18h1m3 0h4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-.8.5-1.2 1-1.2 2M12 17h.01" /></>,
    insights: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3" /><path d="M3 21h18" /></>,
    lane: <><path d="M7 21 10 3h4l3 18" /><path d="M9 15h6M10 9h4" /><path d="m12 5-1 2h2l-1-2Z" /></>,
    league: <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1a4 4 0 0 0 4 4m7-5h3v1a4 4 0 0 1-4 4M12 12v5m-4 3h8m-6-3h4" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    'pin-leave': <><path d="M8 4c1.2 2.2 1 4-.5 5.5C6.4 10.6 6 12.2 6 15h4c0-2.8-.4-4.4-1.5-5.5C7 8 6.8 6.2 8 4Z" /><path d="M16 4c1.2 2.2 1 4-.5 5.5C14.4 10.6 14 12.2 14 15h4c0-2.8-.4-4.4-1.5-5.5C15 8 14.8 6.2 16 4Z" /><path d="M5 19h6m2 0h6" /></>,
    quick: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    sessions: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    start: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
    today: <><path d="M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z" /><path d="M12 7v5l3 2" /></>,
    tournament: <><path d="M6 4h12v5a6 6 0 0 1-12 0V4Z" /><path d="M9 20h6m-3-5v5M6 7H3v2a4 4 0 0 0 4 4m11-6h3v2a4 4 0 0 1-4 4" /></>,
  }[name]

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  )
}
