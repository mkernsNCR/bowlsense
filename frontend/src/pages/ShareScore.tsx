import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ActionIcon, PublicShell } from '../features/competition/CompetitionUI'

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

  const title = useMemo(() => (data ? `${data.game.score} — BowlSense score` : 'BowlSense score'), [data])
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
    const text = `I just scored ${data.game.score} at ${data.session.location || 'the alley'}. #BowlSense`
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
        <div className="muted">Loading score card…</div>
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
    <PublicShell
      eyebrow="Game result"
      title={data.player?.name ? `${data.player.name} rolled ${data.game.score}` : `A ${data.game.score} game`}
      detail={[data.session.location, data.session.date, data.session.lanes ? `Lanes ${data.session.lanes}` : null].filter(Boolean).join(' · ')}
      action={<button type="button" onClick={copyLink} className="btn btn-primary"><ActionIcon name="share" /> {copied ? 'Link copied' : 'Share result'}</button>}
    >
      <div className="share-result">
        <section className="share-result__primary" aria-label={`Final score ${data.game.score}`}>
          <div><div className="share-result__score">{data.game.score}</div><div className="share-result__label">Final score · Game {data.game.gameNumber}</div></div>
        </section>
        <dl className="share-result__facts">
          <div className="share-result__fact"><dt>Strikes</dt><dd>{data.game.strikes}</dd></div>
          <div className="share-result__fact"><dt>Spares</dt><dd>{data.game.spares}</dd></div>
          <div className="share-result__fact"><dt>Splits</dt><dd>{data.game.splits}</dd></div>
          {data.game.ballName && <div className="share-result__fact"><dt>Ball</dt><dd>{data.game.ballName}</dd></div>}
        </dl>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={shareOnX}
            className="btn btn-ghost"
          >
            Share on X
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="btn btn-ghost"
          >
            {downloading ? 'Saving…' : 'Download image'}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="btn btn-ghost"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
      </div>
    </PublicShell>
  )
}
