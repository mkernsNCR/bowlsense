import type { ReactNode, RefObject } from 'react'
import { Sheet } from '../../design'

interface ScoringSheetProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  onClose?: () => void
  role?: 'dialog' | 'alertdialog'
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  wide?: boolean
  className?: string
  backdropClassName?: string
}

export default function ScoringSheet({
  open,
  title,
  description,
  children,
  onClose,
  role,
  dismissible,
  initialFocusRef,
  wide = false,
  className = '',
  backdropClassName,
}: ScoringSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      role={role}
      dismissible={dismissible}
      initialFocusRef={initialFocusRef}
      closeLabel={typeof title === 'string' ? `Close ${title}` : 'Close'}
      backdropClassName={backdropClassName}
      className={`scoring-sheet-theme scoring-sheet-panel${wide ? ' scoring-sheet-panel--wide' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </Sheet>
  )
}
