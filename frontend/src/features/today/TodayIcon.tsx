import { Icon, type IconName as DesignIconName } from '../../design'

type TodayIconName = 'chevron' | 'league' | 'location' | 'play' | 'retry' | 'trendDown' | 'trendUp'
type SharedIconName = Extract<TodayIconName, 'chevron' | 'league' | 'location'>
type LocalIconName = Exclude<TodayIconName, SharedIconName>

const sharedIcons: Record<SharedIconName, DesignIconName> = {
  chevron: 'chevron-right',
  league: 'league',
  location: 'location',
}

const localPaths: Record<LocalIconName, React.ReactNode> = {
    play: <><path d="M8 5v14l11-7Z" /><path d="M4 5v14" /></>,
    retry: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    trendDown: <><path d="m4 7 6 6 4-4 6 6" /><path d="M15 15h5v-5" /></>,
  trendUp: <><path d="m4 17 6-6 4 4 6-6" /><path d="M15 9h5v5" /></>,
}

function isSharedIconName(name: TodayIconName): name is SharedIconName {
  return name in sharedIcons
}

export function TodayIcon({ name }: { name: TodayIconName }) {
  if (isSharedIconName(name)) return <Icon className="today-icon" name={sharedIcons[name]} />

  return (
    <svg className="today-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {localPaths[name]}
    </svg>
  )
}
