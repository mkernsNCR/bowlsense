import { useMemo, useState } from 'react'
import ShareCard from './ShareCard'

interface PerfectGameCelebrationProps {
  score: number
  gameNumber: number
  frameData: string
  session: { location: string; date: string; lanes?: string }
  ballName?: string
  saving?: boolean
  onShare: () => void
  onSave: () => void
  onRetake: () => void
}

interface ConfettiParticle {
  id: number
  x: number
  y: number
  size: number
  color: string
  delay: number
  duration: number
  drift: number
  rotate: number
  shape: 'square' | 'circle'
}

interface ScoredFrame {
  ball1?: unknown
  ball2?: unknown
  ball3?: unknown
}

const confettiColors = ['#fbbf24', '#a78bfa', '#ffffff', '#34d399'] as const

function fraction(seed: number) {
  return ((seed * 9301 + 49297) % 233280) / 233280
}

function isScoredFrame(value: unknown): value is ScoredFrame {
  return typeof value === 'object' && value !== null
}

function getStats(frameData: string) {
  try {
    const parsed: unknown = JSON.parse(frameData)
    const frames = typeof parsed === 'object' && parsed !== null && 'frames' in parsed && Array.isArray(parsed.frames)
      ? parsed.frames.filter(isScoredFrame)
      : []

    let strikes = 0
    let spares = 0

    frames.forEach((f, idx) => {
      const b1 = f?.ball1
      const b2 = f?.ball2
      const b3 = f?.ball3
      if (idx < 9) {
        if (b1 === 10) strikes += 1
        else if (typeof b1 === 'number' && typeof b2 === 'number' && b1 + b2 === 10) spares += 1
      } else {
        if (b1 === 10) strikes += 1
        if (b2 === 10) strikes += 1
        if (b3 === 10) strikes += 1
        if (b1 !== 10 && typeof b1 === 'number' && typeof b2 === 'number' && b1 + b2 === 10) spares += 1
        if (b2 !== 10 && typeof b2 === 'number' && typeof b3 === 'number' && b2 + b3 === 10) spares += 1
      }
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
  saving = false,
  onShare,
  onSave,
  onRetake,
}: PerfectGameCelebrationProps) {
  const [showShareCard, setShowShareCard] = useState(false)

  const particles = useMemo<ConfettiParticle[]>(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: fraction(i * 11 + 1) * 100,
      y: fraction(i * 11 + 2) * 50,
      size: 6 + fraction(i * 11 + 3) * 6,
      color: confettiColors[Math.floor(fraction(i * 11 + 4) * confettiColors.length)] ?? confettiColors[0],
      delay: fraction(i * 11 + 5) * 0.8,
      duration: 2 + fraction(i * 11 + 6),
      drift: -30 + fraction(i * 11 + 7) * 60,
      rotate: -280 + fraction(i * 11 + 8) * 560,
      shape: fraction(i * 11 + 9) > 0.5 ? 'square' : 'circle',
    }))
  }, [])

  const stats = useMemo(() => getStats(frameData), [frameData])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {particles.map((p) => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                background: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : '2px',
                opacity: 0.95,
                animation: `confetti-fall-${p.id} ${p.duration}s ease-out ${p.delay}s forwards`,
              }}
            />
          ))}
        </div>

        <div style={{ width: '100%', maxWidth: 420, background: '#0d0d1a', borderRadius: 24, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', padding: '28px 22px', position: 'relative', zIndex: 1 }}>
          <div className="perfect-badge" style={{ width: 'fit-content', margin: '0 auto 12px', background: '#fbbf24', color: '#0d0d1a', borderRadius: 999, fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', padding: '6px 20px' }}>
            PERFECT GAME
          </div>

          <div className="perfect-score" style={{ textAlign: 'center', color: '#fbbf24', fontSize: 120, fontWeight: 900, lineHeight: 0.95, margin: '2px 0 2px' }}>
            {score}
          </div>

          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.74)', letterSpacing: '0.08em', fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
            ALL 12 STRIKES
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <button
              className="btn"
              disabled={saving}
              onClick={() => {
                onShare()
                setShowShareCard(true)
              }}
              style={{ minHeight: 50, border: 'none', borderRadius: 14, background: '#fbbf24', color: '#0d0d1a', fontWeight: 800, fontSize: 15 }}
            >
              📤 Share Card
            </button>
            <button
              className="btn"
              disabled={saving}
              onClick={onSave}
              style={{ minHeight: 46, borderRadius: 14, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }}
            >
              💾 Save Game
            </button>
            <button
              className="btn"
              disabled={saving}
              onClick={onRetake}
              style={{ minHeight: 46, borderRadius: 14, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700 }}
            >
              🔄 Retake
            </button>
          </div>
        </div>
      </div>

      {showShareCard && (
        <ShareCard
          game={{
            gameNumber,
            score,
            strikes: stats.strikes,
            spares: stats.spares,
            splits: stats.splits,
            frameData,
          }}
          session={session}
          ballName={ballName}
          onClose={() => setShowShareCard(false)}
        />
      )}

      <style>{`
        .perfect-badge {
          animation: badge-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        .perfect-score {
          animation:
            score-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both,
            score-glow 500ms ease-in-out 3;
        }

        @keyframes badge-pop {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes score-pop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes score-glow {
          0%, 100% { text-shadow: 0 0 0 rgba(251,191,36,0); }
          50% { text-shadow: 0 0 40px rgba(251,191,36,0.8); }
        }

        ${particles
          .map(
            (p) => `@keyframes confetti-fall-${p.id} {
              0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 1; }
              100% { transform: translate3d(${p.drift}px, 110vh, 0) rotate(${p.rotate}deg); opacity: 0.95; }
            }`,
          )
          .join('\n')}
      `}</style>
    </>
  )
}
