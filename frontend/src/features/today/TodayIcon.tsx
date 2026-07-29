import { Icon, type IconName as DesignIconName } from '../../design'

type TodayIconName = 'chevron' | 'league' | 'location' | 'play' | 'retry' | 'trendDown' | 'trendUp'

const iconNames: Record<TodayIconName, DesignIconName> = {
  chevron: 'chevron-right',
  league: 'league',
  location: 'location',
  play: 'chevron-right',
  retry: 'back',
  trendDown: 'chevron-right',
  trendUp: 'chevron-right',
}

export function TodayIcon({ name }: { name: TodayIconName }) {
  return <Icon className={`today-icon today-icon--${name}`} name={iconNames[name]} />
}
