import { useEffect, useRef, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import ShellIcon from './ShellIcon'
import { moreGroups } from './navigation'

interface MoreSheetProps {
  onClose: () => void
  restoreFocusRef: RefObject<HTMLButtonElement | null>
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function MoreSheet({ onClose, restoreFocusRef }: MoreSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const restoreFocusTarget = restoreFocusRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.querySelector<HTMLElement>('[data-sheet-initial]')?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const media = window.matchMedia('(min-width: 768px)')
    const handleWidthChange = (event: MediaQueryListEvent) => {
      if (event.matches) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    media.addEventListener('change', handleWidthChange)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      media.removeEventListener('change', handleWidthChange)
      document.body.style.overflow = previousOverflow
      if (restoreFocusTarget && document.contains(restoreFocusTarget)) {
        restoreFocusTarget.focus()
      }
    }
  }, [onClose, restoreFocusRef])

  return (
    <div
      className="bs-shell__sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        id="bs-more-sheet"
        className="bs-shell__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-more-title"
        tabIndex={-1}
      >
        <div className="bs-shell__sheet-grabber" aria-hidden="true" />
        <div className="bs-shell__sheet-header">
          <h2 id="bs-more-title" className="bs-shell__sheet-title">More</h2>
          <button type="button" className="bs-shell__sheet-close" aria-label="Close more navigation" onClick={onClose}>
            <ShellIcon name="close" size={20} />
          </button>
        </div>

        {moreGroups.map((group, groupIndex) => (
          <section className="bs-shell__more-group" aria-labelledby={`bs-more-group-${groupIndex}`} key={group.label}>
            <h3 id={`bs-more-group-${groupIndex}`} className="bs-shell__more-heading">{group.label}</h3>
            <ul className="bs-shell__more-list">
              {group.items.map((item, itemIndex) => (
                <li key={item.path}>
                  <Link
                    className="bs-shell__more-link"
                    to={item.path}
                    onClick={onClose}
                    data-sheet-initial={groupIndex === 0 && itemIndex === 0 ? '' : undefined}
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
      </div>
    </div>
  )
}
