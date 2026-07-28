import { useEffect, useRef, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from '../../design'
import ShellIcon from './ShellIcon'
import { moreGroups } from './navigation'

interface MoreSheetProps {
  onClose: () => void
  restoreFocusRef: RefObject<HTMLButtonElement | null>
}

export default function MoreSheet({ onClose }: MoreSheetProps) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const handleWidthChange = (event: MediaQueryListEvent) => {
      if (event.matches) onClose()
    }

    media.addEventListener('change', handleWidthChange)
    return () => {
      media.removeEventListener('change', handleWidthChange)
    }
  }, [onClose])

  return (
    <Sheet
      id="bs-more-sheet"
      open
      onClose={onClose}
      title="More"
      closeLabel="Close more navigation"
      initialFocusRef={firstLinkRef}
      className="bs-shell-sheet-theme bs-shell-more-sheet"
    >
      {moreGroups.map((group, groupIndex) => (
        <section className="bs-shell__more-group" aria-labelledby={`bs-more-group-${groupIndex}`} key={group.label}>
          <h3 id={`bs-more-group-${groupIndex}`} className="bs-shell__more-heading">{group.label}</h3>
          <ul className="bs-shell__more-list">
            {group.items.map((item, itemIndex) => (
              <li key={item.path}>
                <Link
                  ref={groupIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                  className="bs-shell__more-link"
                  to={item.path}
                  onClick={onClose}
                >
                  <span className="bs-shell__more-icon"><ShellIcon name={item.icon} size={19} /></span>
                  <span className="bs-shell__more-label">{item.label}</span>
                  <span className="bs-shell__more-chevron"><ShellIcon name="chevron" size={16} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  )
}
