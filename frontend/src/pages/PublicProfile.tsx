import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { ActionIcon, PublicShell } from '../features/competition/CompetitionUI'

interface PublicStats {
  average: number
  strikeRate: number
  spareRate: number
  totalGames: number
  totalScore?: number
}

export default function PublicProfile() {
  const { settings } = useSettings()
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/stats')
      .then((response) => {
        if (!response.ok) throw new Error('Public statistics are unavailable')
        return response.json() as Promise<PublicStats>
      })
      .then((payload) => { if (mounted) setStats(payload) })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : 'Public statistics are unavailable')
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const profileName = (settings?.name || '').trim()
  const profileTitle = profileName ? `${profileName}'s BowlSense` : 'BowlSense profile'
  const profileDescription = stats
    ? `${stats.totalGames} games · ${Math.round(stats.average)} average`
    : 'Bowling statistics'
  const profileOgImageUrl = profileName
    ? `/api/profile/og-image?name=${encodeURIComponent(profileName)}`
    : '/api/profile/og-image'

  useEffect(() => {
    document.title = profileTitle
    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let element = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attr, property)
        document.head.appendChild(element)
      }
      element.content = content
    }
    setMeta('og:title', profileTitle)
    setMeta('og:description', profileDescription)
    setMeta('og:image', profileOgImageUrl)
    setMeta('twitter:card', 'summary_large_image')
  }, [profileDescription, profileOgImageUrl, profileTitle])

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  if (loading) return <div className="public-scorecard" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading public profile…</div>
  if (error || !stats) return <div className="public-scorecard" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>{error || 'Public profile not found'}</div>

  return (
    <PublicShell
      eyebrow="Public profile"
      title={profileTitle}
      detail={`${stats.totalGames} games tracked`}
      action={<button onClick={copyShareLink} className="btn btn-primary"><ActionIcon name="share" /> {copied ? 'Link copied' : 'Share profile'}</button>}
    >
      <div className="share-result">
        <section className="share-result__primary" aria-label={`Bowling average ${Math.round(stats.average)}`}>
          <div><div className="share-result__score">{Math.round(stats.average)}</div><div className="share-result__label">Career average</div></div>
        </section>
        <dl className="share-result__facts">
          <div className="share-result__fact"><dt>Games tracked</dt><dd>{stats.totalGames}</dd></div>
          <div className="share-result__fact"><dt>Strike rate</dt><dd>{stats.strikeRate}%</dd></div>
          <div className="share-result__fact"><dt>Spare rate</dt><dd>{stats.spareRate}%</dd></div>
          {stats.totalScore != null && <div className="share-result__fact"><dt>Total pins</dt><dd>{stats.totalScore.toLocaleString()}</dd></div>}
        </dl>
      </div>
      <p className="muted" style={{ maxWidth: 620, margin: '18px 0 0', lineHeight: 1.6 }}>
        This shared profile contains aggregate performance only. Session locations, equipment details, and private notes stay private.
      </p>
    </PublicShell>
  )
}
