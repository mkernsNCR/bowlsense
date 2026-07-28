import { useMemo, useState } from 'react'
import ShareCard from './ShareCard'
import { ActionIcon } from '../features/competition/CompetitionUI'

interface PerfectGameCelebrationProps {
  score: number
  gameNumber: number
  frameData: string
  session: { location: string; date: string; lanes?: string }
  ballName?: string
  onShare: () => void
  onSave: () => void
  onRetake: () => void
}

function getStats(frameData: string) {
  try {
    const parsed = JSON.parse(frameData)
    const frames = Array.isArray(parsed?.frames) ? parsed.frames : []
    let strikes = 0
    let spares = 0

    frames.forEach((frame: { ball1?: number; ball2?: number; ball3?: number }, index: number) => {
      const { ball1, ball2, ball3 } = frame
      if (index < 9) {
        if (ball1 === 10) strikes += 1
        else if (typeof ball1 === 'number' && typeof ball2 === 'number' && ball1 + ball2 === 10) spares += 1
        return
      }
      if (ball1 === 10) strikes += 1
      if (ball2 === 10) strikes += 1
      if (ball3 === 10) strikes += 1
      if (ball1 !== 10 && typeof ball1 === 'number' && typeof ball2 === 'number' && ball1 + ball2 === 10) spares += 1
      if (ball2 !== 10 && typeof ball2 === 'number' && typeof ball3 === 'number' && ball2 + ball3 === 10) spares += 1
    })
    return { strikes, spares, splits: 0 }
  } catch {
    return { strikes: 0, spares: 0, splits: 0 }
  }
}

export default function PerfectGameCelebration({
  score,
  gameNumber,
  frameData,
  session,
  ballName,
  onShare,
  onSave,
  onRetake,
}: PerfectGameCelebrationProps) {
  const [showShareCard, setShowShareCard] = useState(false)
  const stats = useMemo(() => getStats(frameData), [frameData])

  return (
    <>
      <div className="perfect-result" role="dialog" aria-modal="true" aria-labelledby="perfect-result-title">
        <section className="perfect-result__card">
          <div className="perfect-result__line" aria-hidden="true" />
          <p className="competition-eyebrow">Perfect game confirmed</p>
          <h2 id="perfect-result-title">Twelve strikes. One clean card.</h2>
          <div className="perfect-result__score" aria-label={`${score} points`}>{score}</div>
          <p className="perfect-result__context">Game {gameNumber} · {session.location} · {session.date}</p>
          <div className="perfect-result__actions">
            <button className="btn btn-primary" onClick={() => { onShare(); setShowShareCard(true) }}><ActionIcon name="share" /> Share score card</button>
            <button className="btn btn-ghost" onClick={onSave}><ActionIcon name="save" /> Save game</button>
            <button className="btn btn-ghost" onClick={onRetake}>Retake</button>
          </div>
        </section>
      </div>

      {showShareCard && (
        <ShareCard
          game={{ gameNumber, score, strikes: stats.strikes, spares: stats.spares, splits: stats.splits, frameData }}
          session={session}
          ballName={ballName}
          onClose={() => setShowShareCard(false)}
        />
      )}

      <style>{`
        .perfect-result { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; color: #f8f5ff; background: rgba(14, 10, 22, .94); }
        .perfect-result__card { position: relative; width: min(100%, 520px); padding: clamp(28px, 7vw, 52px); overflow: hidden; background: #191423; border: 1px solid rgba(255,255,255,.16); border-radius: 22px; box-shadow: 0 24px 70px rgba(0,0,0,.42); }
        .perfect-result__line { position: absolute; inset: 0 0 auto; height: 4px; background: #b89af0; transform-origin: left; animation: perfect-line 700ms ease-out both; }
        .perfect-result h2 { max-width: 420px; margin: 0; font-size: clamp(1.65rem, 6vw, 2.7rem); line-height: 1.05; letter-spacing: -.04em; }
        .perfect-result__score { margin: 30px 0 20px; color: #e1c7ff; font-size: clamp(6.5rem, 28vw, 10rem); font-weight: 850; line-height: .7; letter-spacing: -.08em; }
        .perfect-result__context { color: rgba(255,255,255,.68); }
        .perfect-result__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 28px; }
        .perfect-result__actions .btn:first-child { grid-column: 1 / -1; }
        @keyframes perfect-line { from { transform: scaleX(0); } }
        @media (max-width: 420px) { .perfect-result__actions { grid-template-columns: 1fr; } .perfect-result__actions .btn:first-child { grid-column: auto; } }
        @media (prefers-reduced-motion: reduce) { .perfect-result__line { animation: none; } }
      `}</style>
    </>
  )
}
