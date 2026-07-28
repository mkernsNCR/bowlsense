import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ShareCard from '../components/ShareCard'
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
  const [copied, setCopied] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      setNotFound(false)
      try {
        const res = await fetch(`/api/games/perfect/${gameId}`)
        if (!res.ok) {
          if (res.status === 404 && mounted) setNotFound(true)
          return
        }
        const json = await res.json()
        if (mounted) setData(json)
      } catch {
        if (mounted) setNotFound(true)
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

  useEffect(() => {
    document.title = title
    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let el = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, property)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
    setMeta('og:title', title)
    setMeta('og:description', description)
    if (ogImageUrl) {
      setMeta('og:image', ogImageUrl)
      setMeta('og:image:width', '1200')
      setMeta('og:image:height', '630')
    }
    setMeta('twitter:card', 'summary_large_image')
  }, [title, description, ogImageUrl])

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
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
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>🎳</div>
          <h1 style={{ marginBottom: 10 }}>Perfect game not found</h1>
          <Link to="/" className="btn btn-primary">BowlSense home</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
        <div className="muted">Loading your perfect game...</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="public-competition-page" style={{ minHeight: '100vh', background: 'var(--canvas)', color: 'var(--ink)', padding: '32px 16px 48px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          display: 'inline-block',
          background: 'color-mix(in srgb, var(--strike-gold) 15%, transparent)',
          border: '1px solid color-mix(in srgb, var(--strike-gold) 40%, transparent)',
          color: 'var(--strike-gold)',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.1em',
          padding: '4px 14px',
          marginBottom: 12,
        }}>
          🏆 PERFECT GAME
        </div>
        <h1 style={{
          margin: '0 0 8px',
          fontSize: 'clamp(2.5rem, 10vw, 5rem)',
          fontWeight: 900,
          lineHeight: 1,
          color: 'var(--strike-gold)',
        }}>
          {data.game.score}
        </h1>
        <div style={{ color: 'color-mix(in srgb, var(--ink) 70%, transparent)', fontSize: 16 }}>
          {data.session.location || 'Unknown Alley'} · {data.session.date}
        </div>
      </div>

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
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          className="btn"
          onClick={() => shareOnX(data.game.id, data.game.score, data.session.location)}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'color-mix(in srgb, var(--strike-gold) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--strike-gold) 40%, transparent)',
            color: 'var(--strike-gold)',
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 12,
            cursor: 'pointer',
          }}
        >
          Share on X
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleDownload}
          style={{
            flex: 1,
            minHeight: 50,
            background: 'color-mix(in srgb, var(--strike-gold) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--strike-gold) 40%, transparent)',
            color: 'var(--strike-gold)',
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
            background: 'color-mix(in srgb, var(--strike-gold) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--strike-gold) 40%, transparent)',
            color: 'var(--strike-gold)',
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
            border: '1px solid color-mix(in srgb, var(--strike-gold) 30%, transparent)',
            color: 'color-mix(in srgb, var(--ink) 80%, transparent)',
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
          Customize &amp; download
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
          <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 24, maxWidth: 480, width: '100%', border: '1px solid color-mix(in srgb, var(--ink) 6%, transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Customize Share Card</span>
              <button
                onClick={() => setShowShareCard(false)}
                style={{ background: 'none', border: 'none', color: 'color-mix(in srgb, var(--ink) 60%, transparent)', cursor: 'pointer', fontSize: 20 }}
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
        <Link to="/" style={{ color: 'var(--ink-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
          BowlSense home
        </Link>
      </div>
    </div>
  )
}
