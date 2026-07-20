import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ShareCard from '../components/ShareCard'

interface PublicGamePayload {
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
  player?: {
    name: string
  } | null
}

export default function ShareScore() {
  const { gameId } = useParams()
  const [data, setData] = useState<PublicGamePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      setLoading(true)
      setNotFound(false)
      try {
        const res = await fetch(`/api/games/${gameId}/public`)
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

    run()
    return () => {
      mounted = false
    }
  }, [gameId])

  // Use server-generated OG image (no client-side canvas capture needed)
  const ogImageUrl = useMemo(() => {
    if (!data) return ''
    return `/api/games/${data.game.id}/og-image`
  }, [data])

  const title = useMemo(() => (data ? `I scored ${data.game.score}! 🎳` : 'BowlSense Score Share'), [data])
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
    if (ogImageUrl) setMeta('og:image', ogImageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('twitter:card', 'summary_large_image')
  }, [title, description, ogImageUrl])

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const shareOnX = () => {
    if (!data) return
    const text = `I just scored ${data.game.score} at ${data.session.location || 'the alley'}! 🎳 #BowlSense`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadPng = async () => {
    if (downloading || !data) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/games/${data.game.id}/og-image`)
      if (!res.ok) throw new Error('Failed to fetch image')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bowlsense-game-${data.game.score}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed', err)
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: 'white', display: 'grid', placeItems: 'center' }}>
        <div className="muted">Loading score card...</div>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d0d1a', color: 'white', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: 10 }}>Game not found</h1>
          <Link to="/" className="btn btn-primary">Back to BowlSense</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', color: 'white', padding: '28px 16px 20px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, textAlign: 'center' }}>🎳 I just scored {data.game.score}!</h1>

        <div style={{ width: '100%', maxWidth: 800 }}>
          <div style={{ position: 'relative', width: '100%', paddingTop: '57.5%', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <ShareCard
                game={data.game}
                session={{ location: data.session.location, date: data.session.date, lanes: data.session.lanes || '' }}
                ballName={data.game.ballName || undefined}
                onClose={() => {}}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 800, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={shareOnX}
            className="btn"
            style={{ flex: 1, minHeight: 48, minWidth: 160, background: '#7c3aed', color: 'white', border: '1px solid rgba(167,139,250,0.5)', fontWeight: 800, borderRadius: 12 }}
          >
            Share on X
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="btn btn-ghost"
            style={{ flex: 1, minHeight: 48, minWidth: 160, border: '1px solid rgba(167,139,250,0.5)', color: 'white', fontWeight: 800, borderRadius: 12 }}
          >
            {downloading ? '⏳ Saving...' : '⬇️ Download PNG'}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="btn btn-ghost"
            style={{ flex: 1, minHeight: 48, minWidth: 160, border: '1px solid rgba(167,139,250,0.5)', color: 'white', fontWeight: 800, borderRadius: 12 }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 }}>Made with 🎳 BowlSense</div>
      </div>
    </div>
  )
}