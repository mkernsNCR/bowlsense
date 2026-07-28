import { Icon, type IconName } from '../../design'

type ScoringIconName = 'arrow-left' | 'check' | 'chevron' | 'download' | 'more' | 'plus' | 'search' | 'share' | 'trash' | 'undo'

interface ScoringIconProps {
  name: ScoringIconName
  size?: number
}

const iconNames: Record<ScoringIconName, IconName> = {
  'arrow-left': 'back',
  check: 'check',
  chevron: 'chevron-right',
  download: 'download',
  more: 'more',
  plus: 'plus',
  search: 'search',
  share: 'share',
  trash: 'trash',
  undo: 'undo',
}

export default function ScoringIcon({ name, size = 20 }: ScoringIconProps) {
  return <Icon name={iconNames[name]} size={size} />
}
