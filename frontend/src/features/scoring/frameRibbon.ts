import type { FrameRibbonFrame } from '../../design'
import { getDisplayMark, type Frame } from '../../utils/bowlingScore'

export function toFrameRibbonFrames(
  frames: readonly Frame[],
  currentFrame?: number,
): FrameRibbonFrame[] {
  return frames.map((frame, index) => {
    const rolls = [getDisplayMark(frame, 0), getDisplayMark(frame, 1), ...(index === 9 ? [getDisplayMark(frame, 2)] : [])]
      .filter(Boolean)
    const state = index === currentFrame
      ? 'current'
      : frame.ball1 == null
        ? 'pending'
        : frame.isStrike
          ? 'strike'
          : frame.isSpare
            ? 'spare'
            : 'open'
    const rollDescription = rolls.length > 0 ? `Rolls ${rolls.join(', ')}` : 'Not bowled'
    const scoreDescription = frame.cumulative == null ? '' : `, cumulative score ${frame.cumulative}`

    return {
      rolls,
      score: frame.cumulative,
      state,
      ariaLabel: `Frame ${index + 1}, ${state}, ${rollDescription}${scoreDescription}`,
    }
  })
}
