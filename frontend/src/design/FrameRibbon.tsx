import { useEffect, useRef } from 'react'

export type FrameState = 'pending' | 'partial' | 'current' | 'complete' | 'strike' | 'spare' | 'open'

export interface FrameRibbonFrame {
  rolls?: readonly string[]
  score?: number | null
  state?: FrameState
  label?: string
  ariaLabel?: string
}

export interface FrameRibbonProps {
  frames: readonly FrameRibbonFrame[]
  label?: string
  compact?: boolean
  className?: string
}

function frameDescription(frame: FrameRibbonFrame, index: number) {
  const state = frame.state ?? 'pending'
  const rolls = frame.rolls?.length ? `Rolls ${frame.rolls.join(', ')}` : 'Not bowled'
  const score = frame.score == null ? '' : `, cumulative score ${frame.score}`
  return frame.ariaLabel ?? frame.label ?? `Frame ${index + 1}, ${state}, ${rolls}${score}`
}

export function FrameRibbon({ frames, label = 'Ten-frame game', compact = false, className = '' }: FrameRibbonProps) {
  const ribbonRef = useRef<HTMLDivElement>(null)
  const normalized = Array.from({ length: 10 }, (_, index) => frames[index] ?? { state: 'pending' as const })
  const currentIndex = normalized.findIndex((frame) => frame.state === 'current')

  useEffect(() => {
    if (currentIndex < 0) return
    const activeFrame = ribbonRef.current?.querySelector<HTMLElement>(`[data-frame="${currentIndex}"]`)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    activeFrame?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex])

  return (
    <div ref={ribbonRef} className={`bs-frame-ribbon${compact ? ' bs-frame-ribbon--compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="bs-frame-ribbon__track">
        <div className="bs-frame-ribbon__lane" aria-hidden="true" />
        <ol className="bs-frame-ribbon__frames" aria-label={label}>
          {normalized.map((frame, index) => {
            const state = frame.state ?? 'pending'
            const description = frameDescription(frame, index)
            return (
              <li
                key={index}
                className={`bs-frame-ribbon__frame is-${state}`}
                aria-label={description}
                aria-current={state === 'current' ? 'step' : undefined}
                data-frame={index}
              >
                <span className="bs-frame-ribbon__number">{index + 1}</span>
                <span className="bs-frame-ribbon__rolls" aria-hidden="true">
                  {frame.rolls?.length ? frame.rolls.join(' ') : '·'}
                </span>
                <span className="bs-frame-ribbon__score" aria-hidden="true">{frame.score ?? '—'}</span>
                {state === 'current' ? <span className="bs-visually-hidden">Current frame</span> : null}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
