import { useEffect, useRef } from 'react'
import { getDisplayMark, type Frame } from '../../utils/bowlingScore'

interface FrameRibbonProps {
  frames: Frame[]
  currentFrame?: number
  onSelectFrame?: (index: number) => void
  label?: string
}

export default function FrameRibbon({ frames, currentFrame, onSelectFrame, label = 'Ten-frame score' }: FrameRibbonProps) {
  const ribbonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (currentFrame == null) return
    const activeFrame = ribbonRef.current?.querySelector<HTMLElement>(`[data-frame="${currentFrame}"]`)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    activeFrame?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' })
  }, [currentFrame])

  return (
    <div ref={ribbonRef} className="frame-ribbon-wrap" role="group" aria-label={label}>
      <div className="frame-ribbon">
        {frames.slice(0, 10).map((frame, index) => {
          const isCurrent = index === currentFrame
          const canSelect = Boolean(onSelectFrame && frame.ball1 != null)
          const content = (
            <>
              <span className="frame-ribbon-number">{index + 1}</span>
              <span className="frame-ribbon-marks" aria-label={`Frame ${index + 1} rolls`}>
                <span>{getDisplayMark(frame, 0) || '\u00a0'}</span>
                <span>{getDisplayMark(frame, 1) || '\u00a0'}</span>
                {index === 9 && <span>{getDisplayMark(frame, 2) || '\u00a0'}</span>}
              </span>
              <span className="frame-ribbon-score">{frame.cumulative ?? '\u00a0'}</span>
            </>
          )

          return canSelect ? (
            <button
              type="button"
              key={index}
              className="frame-ribbon-frame is-editable"
              data-frame={index}
              data-current={isCurrent || undefined}
              onClick={() => onSelectFrame?.(index)}
              aria-label={`Edit frame ${index + 1}`}
            >
              {content}
            </button>
          ) : (
            <div key={index} className="frame-ribbon-frame" data-frame={index} data-current={isCurrent || undefined}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
