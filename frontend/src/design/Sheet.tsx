import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
  className?: string
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let activeBodyScrollLocks = 0
let bodyOverflowBeforeLock = ''

function lockBodyScroll() {
  if (activeBodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  activeBodyScrollLocks += 1
}

function unlockBodyScroll() {
  activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1)
  if (activeBodyScrollLocks === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock
  }
}

export function Sheet({ open, onClose, title, description, children, footer, closeLabel = 'Close', className = '' }: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    lockBodyScroll()

    const focusFrame = requestAnimationFrame(() => {
      const firstControl = panel?.querySelector<HTMLElement>(focusableSelector)
      ;(firstControl ?? panel)?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((control) => !control.hasAttribute('disabled') && control.getAttribute('aria-hidden') !== 'true')
      if (controls.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(focusFrame)
      unlockBodyScroll()
      returnFocus?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="bs-sheet-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div
        ref={panelRef}
        className={`bs-sheet ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="bs-sheet__grabber" aria-hidden="true" />
        <header className="bs-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button className="bs-sheet__close" type="button" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="bs-sheet__body">{children}</div>
        {footer ? <footer className="bs-sheet__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
