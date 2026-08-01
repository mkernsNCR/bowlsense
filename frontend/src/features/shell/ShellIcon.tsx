import { Icon, type IconName as DesignIconName } from '../../design'

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

const iconNames: Record<IconName, DesignIconName> = {
  achievement: 'achievement',
  arsenal: 'bag',
  ball: 'bowling-ball',
  calculator: 'calculator',
  chevron: 'chevron-right',
  close: 'close',
  help: 'help',
  insights: 'insights',
  lane: 'lane',
  league: 'league',
  more: 'more',
  'pin-leave': 'pin-leave',
  quick: 'quick',
  sessions: 'sessions',
  settings: 'settings',
  start: 'start',
  today: 'today',
  tournament: 'tournament',
}

export default function ShellIcon({ name, size = 22 }: ShellIconProps) {
  return <Icon name={iconNames[name]} size={size} />
}
