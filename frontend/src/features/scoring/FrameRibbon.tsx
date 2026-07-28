import { FrameRibbon as DesignFrameRibbon, type FrameRibbonFrame, type FrameState } from '../../design'
import { getDisplayMark, type Frame } from '../../utils/bowlingScore'

interface ScoringFrameRibbonProps {
  frames: Frame[]
  currentFrame?: number
  onSelectFrame?: (index: number) => void
  label?: string
}

function frameState(frame: Frame, index: number, currentFrame?: number): FrameState {
  if (index === currentFrame) return 'current'
  if (frame.ball1 == null) return 'pending'
  if (frame.isStrike) return 'strike'
  if (frame.isSpare) return 'spare'
  if (frame.ball2 == null) return 'complete'
  return 'open'
}

function frameRolls(frame: Frame, index: number) {
  const rollIndexes: readonly (0 | 1 | 2)[] = index === 9 ? [0, 1, 2] : [0, 1]
  return rollIndexes.map((rollIndex) => getDisplayMark(frame, rollIndex)).filter(Boolean)
}

export default function FrameRibbon({
  frames,
  currentFrame,
  onSelectFrame,
  label = 'Ten-frame score',
}: ScoringFrameRibbonProps) {
  const ribbonFrames: FrameRibbonFrame[] = frames.slice(0, 10).map((frame, index) => ({
    rolls: frameRolls(frame, index),
    score: frame.cumulative,
    state: frameState(frame, index, currentFrame),
    selectable: frame.ball1 != null,
  }))

  return <DesignFrameRibbon frames={ribbonFrames} label={label} onSelectFrame={onSelectFrame} />
}
