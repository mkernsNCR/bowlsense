import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ShareCard from '../components/ShareCard'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'
import { downloadGameImage, nativeShareGame, shareOnX } from '../utils/gameShare'

interface PerfectGamePayload {
  game: {
    id: number
    gameNumber: number
    score: number
    strikes: number
    spares: number
    splits: number
    frameData?: string | null
    ballName?: string | null
  }
  session: {
    date: string
    location: string
    lanes?: string | null
  }
}

export default function PerfectGameShare() {
  const { id } = useParams()
  const gameId = Number(id)
  const [data, setData] = useState<PerfectGamePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      setNotFound(false)
      setLoadError(false)
      try {
        const res = await fetch(`/api/games/perfect/${gameId}`)
        if (!res.ok) {
          if (res.status === 404 && mounted) setNotFound(true)
          else if (mounted) setLoadError(true)
          return
        }
        const json = await res.json()
        if (mounted) setData(json)
      } catch {
        if (mounted) setLoadError(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    if (Number.isFinite(gameId)) run()
    return () => { mounted = false }
  }, [gameId])

  const ogImageUrl = useMemo(() => {
    if (!data) return ''
    return `/api/games/${data.game.id}/og-image`
  }, [data])

  const title = useMemo(() =>
    data ? `🏆 Perfect 300! 🎳` : 'Perfect 300 — BowlSense',
  [data])

  const description = useMemo(() => {
    if (!data) return 'BowlSense'
    return `${data.session.location || 'Unknown Alley'} · ${data.session.date || ''}`
  }, [data])

  usePublicMetadata({ title, description, imageUrl: ogImageUrl })

  const handleCopyLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const handleNativeShare = async () => {
    if (!data || sharing) return
    setSharing(true)
    const imageFileName = `bowlsense-300-${data.session.date || 'game'}-${data.game.id}.png`
    await nativeShareGame({
      gameId: data.game.id,
      filename: imageFileName,
      title: `Perfect 300 at ${data.session.location || 'the alley'}!`,
      text: `I rolled a perfect 300 in BowlSense 🎳`,
    })
    setSharing(false)
  }

  const handleDownload = async () => {
    if (!data) return
    const imageFileName = `bowlsense-300-${data.session.date || 'game'}-${data.game.id}.png`
    await downloadGameImage(data.game.id, imageFileName)
  }

  if (!Number.isFinite(gameId) || (loading === false && notFound)) {
    return (
      <PublicShell eyebrow="Perfect game" title="Perfect game not found"><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  if (loading) {
    return (
      <PublicShell eyebrow="Perfect game" title="Loading shared result"><div className="muted">Loading your perfect game...</div></PublicShell>
    )
  }

  if (loadError) {
    return <PublicShell eyebrow="Perfect game" title="Perfect game unavailable"><p role="alert">This shared result could not be loaded right now.</p><Link to="/">BowlSense home</Link></PublicShell>
  }

  if (!data) return <PublicShell eyebrow="Perfect game" title="Perfect game unavailable"><Link to="/">BowlSense home</Link></PublicShell>

  return (
    <PublicShell eyebrow="Perfect game" title="Perfect 300" detail={`${data.session.location || 'Unknown Alley'} · ${data.session.date}`}>
      <div className="public-legacy-content">
      <PublicResult score={data.game.score} label="Final score" accessibleLabel={`Perfect game score ${data.game.score}`} facts={[
        { label: 'Strikes', value: data.game.strikes },
        { label: 'Spares', value: data.game.spares },
        { label: 'Ball', value: data.game.ballName || 'Not recorded' },
      ]} />

      {/* OG share card image */}
      <div style={{ maxWidth: 860, margin: '0 auto 24px', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ position: 'relative', width: '100%', paddingTop: '52.5%' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <img
              src={ogImageUrl}
              alt={`Score ${data.game.score} at ${data.session.location}`}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="perfect-game-actions" style={{ maxWidth: 860, margin: '0 auto' }}>
        <button
          type="button"
          className="btn"
          onClick={() => shareOnX(data.game.id, data.game.score, data.session.location)}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: '#fbbf24',
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          𝕏 Share on X
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleDownload}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: '#fbbf24',
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Download image
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleNativeShare}
          disabled={sharing}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: '#fbbf24',
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Share
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleCopyLink}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'transparent',
            border: '1px solid rgba(251,191,36,0.3)',
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 700,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>

      {/* Customize share card */}
      <div style={{ maxWidth: 860, margin: '20px auto 0' }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowShareCard(true)}
          style={{ width: '100%', minHeight: 44, fontSize: 14, justifyContent: 'center', opacity: 0.8 }}
        >
          🎨 Customize &amp; Download
        </button>
      </div>

      {showShareCard && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16,
        }}>
          <div style={{ background: '#12122a', borderRadius: 20, padding: 24, maxWidth: 480, width: '100%', border: '1px solid rgba(167,139,250,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Customize Share Card</span>
              <button
                onClick={() => setShowShareCard(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 20 }}
              >
                ×
              </button>
            </div>
            <ShareCard
              game={{
                gameNumber: data.game.gameNumber,
                score: data.game.score,
                strikes: data.game.strikes,
                spares: data.game.spares,
                splits: data.game.splits,
                frameData: data.game.frameData,
              }}
              session={{
                location: data.session.location,
                date: data.session.date,
                lanes: data.session.lanes || '',
              }}
              ballName={data.game.ballName || undefined}
              onClose={() => setShowShareCard(false)}
            />
          </div>
        </div>
      )}

      {/* Back link */}
      <div style={{ maxWidth: 860, margin: '28px auto 0', textAlign: 'center' }}>
        <Link to="/" style={{ color: 'rgba(167,139,250,0.8)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          BowlSense home
        </Link>
      </div>
      </div>
    </PublicShell>
  )
}
