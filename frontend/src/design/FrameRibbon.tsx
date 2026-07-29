export type FrameState = 'pending' | 'current' | 'complete' | 'strike' | 'spare' | 'open'

export interface FrameRibbonFrame {
  rolls?: readonly string[]
  score?: number | null
  state?: FrameState
  label?: string
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
  return frame.label ?? `Frame ${index + 1}, ${state}, ${rolls}${score}`
}

export function FrameRibbon({ frames, label = 'Ten-frame game', compact = false, className = '' }: FrameRibbonProps) {
  const normalized = Array.from({ length: 10 }, (_, index) => frames[index] ?? { state: 'pending' as const })
  return (
    <div className={`bs-frame-ribbon${compact ? ' bs-frame-ribbon--compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="bs-frame-ribbon__track">
        <div className="bs-frame-ribbon__lane" aria-hidden="true" />
        <ol className="bs-frame-ribbon__frames" aria-label={label}>
          {normalized.map((frame, index) => {
            const state = frame.state ?? 'pending'
            return (
              <li
                key={index}
                className={`bs-frame-ribbon__frame is-${state}`}
                aria-label={frameDescription(frame, index)}
                aria-current={state === 'current' ? 'step' : undefined}
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
