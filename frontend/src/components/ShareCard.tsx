import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '../design'
import { parseFrameMarks } from '../features/scoring/frameMarks'

interface ShareCardProps {
  game: {
    gameNumber: number
    score: number
    strikes: number
    spares: number
    splits: number
    frameData?: string | null
  }
  session: {
    location: string
    date: string
    lanes?: string
  }
  ballName?: string
  onClose: () => void
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export default function ShareCard({ game, session, ballName, onClose }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sharing, setSharing] = useState(false)
  const marks = useMemo(() => parseFrameMarks(game.frameData), [game.frameData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = 800
    const h = 460

    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#0d0d1a')
    bg.addColorStop(1, '#13132a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#7c3aed'
    ctx.fillRect(0, 0, w, 6)

    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '500 14px sans-serif'
    ctx.fillText('BowlSense', 24, 34)

    const isPerfect = game.score === 300
    const isElite = game.score >= 280

    if (isPerfect) {
      const bx = 290
      const by = 58
      const bw = 220
      const bh = 38
      ctx.fillStyle = '#fbbf24'
      roundedRect(ctx, bx, by, bw, bh, 19)
      ctx.fill()
      ctx.fillStyle = '#0d0d1a'
      ctx.font = '700 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('PERFECT GAME', bx + bw / 2, by + bh / 2 + 1)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    ctx.fillStyle = isElite ? '#fbbf24' : '#a78bfa'
    ctx.font = `800 ${isPerfect ? 120 : 96}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(game.score), w / 2, isPerfect ? 182 : 168)

    const frameY = 248
    const frameH = 68
    const frameGap = 8
    const frameW = 64
    const frameW10 = 88
    const totalFramesWidth = frameW * 9 + frameW10 + frameGap * 9
    const startX = Math.round((w - totalFramesWidth) / 2)

    for (let i = 0; i < 10; i++) {
      const fw = i === 9 ? frameW10 : frameW
      const x = startX + i * (frameW + frameGap)
      const mark = marks[i] || ''
      const upper = mark.toUpperCase()
      const isStrike = upper.includes('X')
      const isSpare = upper.includes('/')

      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      roundedRect(ctx, x, frameY, fw, frameH, 10)
      ctx.fill()

      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 1
      roundedRect(ctx, x, frameY, fw, frameH, 10)
      ctx.stroke()

      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '600 12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(String(i + 1), x + 8, frameY + 16)

      ctx.fillStyle = isStrike ? '#a78bfa' : isSpare ? '#c4b5fd' : '#ffffff'
      ctx.font = `700 ${i === 9 ? 24 : 28}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(mark || '·', x + fw / 2, frameY + frameH / 2 + 8)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 18px sans-serif'
    ctx.fillText(session.location || 'Unknown Alley', 24, 404)

    const dateText = session.date || ''
    const laneText = session.lanes ? ` · Lanes ${session.lanes}` : ''
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '500 14px sans-serif'
    ctx.fillText(`${dateText}${laneText}`, 24, 428)

    if (ballName) {
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '600 16px sans-serif'
      ctx.fillText(ballName, w - 24, 416)
    }
  }, [game.score, marks, session.date, session.lanes, session.location, ballName])

  const toFile = async () => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null

    const safeLocation = (session.location || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return new File([blob], `score-${game.score}-${safeLocation || 'session'}.png`, { type: 'image/png' })
  }

  const saveImage = async () => {
    const file = await toFile()
    if (!file) return
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'

  const shareImage = async () => {
    if (!canShare || sharing) return
    setSharing(true)
    try {
      const file = await toFile()
      if (!file) return
      if (!navigator.canShare({ files: [file] })) return

      await navigator.share({
        title: `Game ${game.gameNumber} - ${game.score}`,
        text: `I rolled ${game.score} at ${session.location}!`,
        files: [file],
      })
    } catch {
      // no-op, user canceled or unsupported runtime branch
    } finally {
      setSharing(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Share game ${game.score}`}
      description="Save or share this score card image."
      closeLabel="Close score card"
      className="share-card-sheet"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={460}
          role="img"
          aria-label={`Score card for game ${game.gameNumber}: ${game.score} at ${session.location || 'Unknown Alley'}. ${session.date}${session.lanes ? `, lanes ${session.lanes}` : ''}.${ballName ? ` Ball: ${ballName}.` : ''} Frames: ${marks.filter(Boolean).join(', ') || 'not available'}.`}
          style={{ width: 'min(400px, calc(100vw - 32px))', height: 'auto', maxWidth: '100%', borderRadius: 14, display: 'block', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" style={{ minHeight: 44, padding: '6px 12px', borderRadius: 10 }} onClick={saveImage}>
            Save image
          </button>

          {canShare && (
            <button className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 12px', borderRadius: 10 }} onClick={shareImage}>
              Share
            </button>
          )}

          <button className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 12px', borderRadius: 10 }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Sheet>
  )
}
