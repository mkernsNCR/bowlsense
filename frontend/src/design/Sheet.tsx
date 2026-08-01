import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface SheetProps {
  open: boolean
  onClose?: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
  closeDisabled?: boolean
  className?: string
  backdropClassName?: string
  id?: string
  role?: 'dialog' | 'alertdialog'
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type OpenSheet = {
  panel: HTMLElement
  returnFocus: HTMLElement | null
}

const openSheets: OpenSheet[] = []
let bodyLockCount = 0
let bodyOverflowBeforeLock = ''

function syncSheetAccessibility() {
  const topmostPanel = openSheets.at(-1)?.panel
  openSheets.forEach((sheet) => {
    if (sheet.panel === topmostPanel) {
      sheet.panel.removeAttribute('aria-hidden')
      sheet.panel.removeAttribute('inert')
      return
    }
    sheet.panel.setAttribute('aria-hidden', 'true')
    sheet.panel.setAttribute('inert', '')
  })
}

function lockBody() {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockBody() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock
  }
}

function isTopSheet(panel: HTMLElement) {
  return openSheets.at(-1)?.panel === panel
}

function registerSheet(panel: HTMLElement, returnFocus: HTMLElement | null) {
  openSheets.push({ panel, returnFocus })
  syncSheetAccessibility()
  lockBody()
}

function unregisterSheet(panel: HTMLElement) {
  const index = openSheets.findIndex((entry) => entry.panel === panel)
  if (index === -1) return

  const wasTopmost = index === openSheets.length - 1
  const [removed] = openSheets.splice(index, 1)
  syncSheetAccessibility()
  const nextNestedSheet = openSheets[index]

  if (nextNestedSheet && removed.panel.contains(nextNestedSheet.returnFocus)) {
    nextNestedSheet.returnFocus = removed.returnFocus
  }

  unlockBody()
  if (!wasTopmost) return

  if (removed.returnFocus?.isConnected) {
    removed.returnFocus.focus()
    return
  }

  const activePanel = openSheets.at(-1)?.panel
  const firstControl = activePanel?.querySelector<HTMLElement>(focusableSelector)
  ;(firstControl ?? activePanel)?.focus()
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = 'Close',
  closeDisabled = false,
  className = '',
  backdropClassName = '',
  id,
  role = 'dialog',
  dismissible = Boolean(onClose),
  initialFocusRef,
}: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  const dismissibleRef = useRef(dismissible)
  const initialFocusRefRef = useRef(initialFocusRef)

  useEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
    dismissibleRef.current = dismissible
    initialFocusRefRef.current = initialFocusRef
  }, [closeDisabled, dismissible, initialFocusRef, onClose])

  useEffect(() => {
    if (!open) return

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (!panel) return
    registerSheet(panel, returnFocus)

    const focusFrame = requestAnimationFrame(() => {
      if (!isTopSheet(panel)) return
      const requestedControl = initialFocusRefRef.current?.current
      if (requestedControl && panel.contains(requestedControl)) {
        requestedControl.focus()
        return
      }
      if (!initialFocusRefRef.current && panel.contains(document.activeElement)) return
      const firstControl = panel.querySelector<HTMLElement>(focusableSelector)
      ;(firstControl ?? panel).focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopSheet(panel)) return
      if (event.key === 'Escape' && dismissibleRef.current && onCloseRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!closeDisabledRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      event.preventDefault()
      event.stopImmediatePropagation()

      const controls = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((control) => !control.hasAttribute('disabled') && control.getAttribute('aria-hidden') !== 'true')
      if (controls.length === 0) {
        panel.focus()
        return
      }
      const activeIndex = controls.indexOf(document.activeElement as HTMLElement)
      const nextIndex = activeIndex === -1
        ? (event.shiftKey ? controls.length - 1 : 0)
        : (activeIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
      controls[nextIndex]?.focus()
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      cancelAnimationFrame(focusFrame)
      unregisterSheet(panel)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className={`bs-sheet-backdrop${backdropClassName ? ` ${backdropClassName}` : ''}`}
      onPointerDown={(event) => {
        if (dismissible && onClose && !closeDisabled && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        id={id}
        className={`bs-sheet ${className}`.trim()}
        role={role}
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
          {dismissible && onClose ? (
            <button className="bs-sheet__close" type="button" onClick={onClose} aria-label={closeLabel} disabled={closeDisabled}>
              <Icon name="close" size={20} />
            </button>
          ) : null}
        </header>
        <div className="bs-sheet__body">{children}</div>
        {footer ? <footer className="bs-sheet__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
