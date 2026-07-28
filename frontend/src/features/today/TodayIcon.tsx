import { Icon, type IconName as DesignIconName } from '../../design'

type TodayIconName = 'chevron' | 'close' | 'league' | 'location' | 'play' | 'retry' | 'trendDown' | 'trendUp'

const iconNames: Record<TodayIconName, DesignIconName> = {
  chevron: 'chevron-right',
  close: 'close',
  league: 'league',
  location: 'location',
  play: 'play',
  retry: 'retry',
  trendDown: 'trend-down',
  trendUp: 'trend-up',
}

export function TodayIcon({ name }: { name: TodayIconName }) {
  return <Icon className="today-icon" name={iconNames[name]} />
}
