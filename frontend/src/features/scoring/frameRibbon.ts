import type { FrameRibbonFrame } from '../../design'
import { getDisplayMark, type Frame } from '../../utils/bowlingScore'

export function toFrameRibbonFrames(
  frames: readonly Frame[],
  currentFrame?: number,
): FrameRibbonFrame[] {
  return frames.map((frame, index) => ({
    rolls: [getDisplayMark(frame, 0), getDisplayMark(frame, 1), ...(index === 9 ? [getDisplayMark(frame, 2)] : [])]
      .filter(Boolean),
    score: frame.cumulative,
    state: index === currentFrame
      ? 'current'
      : frame.ball1 == null
        ? 'pending'
        : frame.isStrike
          ? 'strike'
          : frame.isSpare
            ? 'spare'
            : 'open',
    label: `Frame ${index + 1}${frame.cumulative == null ? '' : `, cumulative score ${frame.cumulative}`}`,
  }))
}
