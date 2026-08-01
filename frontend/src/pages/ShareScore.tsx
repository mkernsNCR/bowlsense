import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../design'
import { PublicResult, PublicShell } from '../features/competition/CompetitionUI'
import { usePublicMetadata } from '../features/competition/publicMetadata'
import { copyText } from '../features/scoring/copyText'

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

  usePublicMetadata({ title, description, imageUrl: ogImageUrl })

  const copyLink = async () => {
    try {
      await copyText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
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
      <PublicShell eyebrow="Game result" title="Loading shared game"><div className="muted">Loading score card…</div></PublicShell>
    )
  }

  if (notFound || !data) {
    return (
      <PublicShell eyebrow="Game result" title="Game not found"><Link to="/">BowlSense home</Link></PublicShell>
    )
  }

  return (
    <PublicShell
      eyebrow="Game result"
      title={data.player?.name ? `${data.player.name} rolled ${data.game.score}` : `A ${data.game.score} game`}
      detail={[data.session.location, data.session.date, data.session.lanes ? `Lanes ${data.session.lanes}` : null].filter(Boolean).join(' · ')}
      action={<button type="button" onClick={copyLink} className="btn btn-primary"><Icon className="competition-action-icon" name="share" /> {copied ? 'Link copied' : 'Share result'}</button>}
    >
      <PublicResult
        score={data.game.score}
        label={`Final score · Game ${data.game.gameNumber}`}
        accessibleLabel={`Final score ${data.game.score}`}
        facts={[
          { label: 'Strikes', value: data.game.strikes },
          { label: 'Spares', value: data.game.spares },
          { label: 'Splits', value: data.game.splits },
          ...(data.game.ballName ? [{ label: 'Ball', value: data.game.ballName }] : []),
        ]}
      />
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
