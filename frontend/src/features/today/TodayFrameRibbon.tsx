import { FrameRibbon } from '../../design'
import { parseFrameRibbonFrames } from './frameMarks'

interface TodayFrameRibbonProps {
  frames?: string | null
  score: number
  gameNumber?: number
  location?: string
}

export function TodayFrameRibbon({ frames, score, gameNumber, location }: TodayFrameRibbonProps) {
  const ribbonFrames = parseFrameRibbonFrames(frames)
  const hasFrameDetails = ribbonFrames.some((frame) => frame.rolls.length > 0)
  const frameSummary = ribbonFrames
    .map((frame, index) => {
      const cumulative = frame.score === null ? '' : `, total ${frame.score}`
      return `Frame ${index + 1}: ${frame.rolls.join(' ') || 'not recorded'}${cumulative}`
    })
    .join(', ')

  return (
    <figure className="today-frame-ribbon">
      <figcaption className="today-sr-only">{`${location || 'Latest game'}, score ${score}. ${frameSummary}`}</figcaption>
      <div className="today-frame-ribbon__meta" aria-hidden="true">
        <span>{location || 'Latest game'}{gameNumber ? ` · Game ${gameNumber}` : ''}</span>
        <strong>{score || '—'}</strong>
      </div>
      <FrameRibbon
        compact
        frames={ribbonFrames}
        label={`${location || 'Latest game'}, score ${score}`}
      />
      {!hasFrameDetails && <p className="today-frame-ribbon__note">Frame details weren’t recorded for this game.</p>}
    </figure>
  )
}
