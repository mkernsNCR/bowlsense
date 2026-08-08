import type { ScoringBall } from './types'
import type { FrameBallIds } from './frameBalls'

interface FrameBallAssignmentsProps {
  balls: ScoringBall[]
  frameBallIds: FrameBallIds
  defaultBallId: string
  onChange: (frameIndex: number, ballId: string) => void
}

export default function FrameBallAssignments({ balls, frameBallIds, defaultBallId, onChange }: FrameBallAssignmentsProps) {
  const defaultBall = balls.find((ball) => String(ball.id) === defaultBallId)

  return (
    <section className="frame-ball-assignments" aria-label="Frame ball assignments">
      <div className="frame-ball-assignments__heading">
        <div>
          <p className="lane-notes-label">Frame balls</p>
          <strong>Ball changes by frame</strong>
        </div>
        <span>{defaultBall ? `Default · ${defaultBall.name}` : 'No default'}</span>
      </div>
      <p className="frame-ball-assignments__hint">Choose a different ball only where you changed shape. Unchanged frames use the default.</p>
      <div className="frame-ball-assignments__list">
        {Array.from({ length: 10 }, (_, frameIndex) => (
          <label className="frame-ball-row" key={frameIndex}>
            <span>Frame {frameIndex + 1}</span>
            <select
              aria-label={`Completion ball for frame ${frameIndex + 1}`}
              value={frameBallIds[frameIndex] == null ? '' : String(frameBallIds[frameIndex])}
              onChange={(event) => onChange(frameIndex, event.target.value)}
            >
              <option value="">Use default{defaultBall ? ` · ${defaultBall.name}` : ''}</option>
              {balls.map((ball) => (
                <option key={ball.id} value={ball.id}>{ball.brand ? `${ball.name} · ${ball.brand}` : ball.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}
