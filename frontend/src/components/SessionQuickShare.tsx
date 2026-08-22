import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  copySessionShareLink,
  downloadSessionCard,
  getSessionShareUrl,
  nativeShareSession,
} from '../utils/sessionShare'

interface SessionQuickShareProps {
  sessionId: number
  location: string
  highScore: number
  date: string
  onClose: () => void
}

const SHEET_STYLES = `
  @keyframes qsFadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes qsSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  @keyframes qsPopIn { from { transform: translateY(20px) scale(0.96); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } }
  .qs-backdrop { animation: qsFadeIn 0.18s ease both; }
  .qs-sheet { animation: qsSlideUp 0.24s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .qs-actions { display: grid; grid-template-columns: 1fr; gap: 8px; }
  @media (min-width: 481px) {
    .qs-backdrop { align-items: center !important; padding: 16px !important; }
    .qs-sheet {
      animation: qsPopIn 0.22s ease both !important;
      border-radius: 20px !important;
      border: 1px solid #252540 !important;
      border-bottom: 1px solid #252540 !important;
      margin-bottom: 0 !important;
    }
    .qs-actions { grid-template-columns: 1fr 1fr !important; }
    .qs-actions > a,
    .qs-actions > button { width: auto !important; }
  }
`

export default function SessionQuickShare({
  sessionId,
  location,
  highScore,
  date,
  onClose,
}: SessionQuickShareProps) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function buildShareText(): string {
    return highScore > 0
      ? `I rolled a ${highScore} at ${location || 'the alley'}! 🎳 #BowlSense`
      : `Bowling at ${location || 'the alley'} 🎳 #BowlSense`
  }

  function handleCopy() {
    void copySessionShareLink(sessionId).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  function handleNativeShare() {
    setBusy('share')
    void nativeShareSession({
      sessionId,
      filename: `bowlsense-session-${sessionId}.png`,
      title: 'BowlSense Session',
      text: buildShareText(),
    }).then((ok) => {
      setBusy(null)
      if (!ok) handleCopy()
    })
  }

  function handleDownload() {
    setBusy('download')
    void downloadSessionCard(sessionId, `bowlsense-session-${sessionId}.png`).finally(() => {
      setBusy(null)
    })
  }

  function handleShareX() {
    const text = buildShareText()
    const url = getSessionShareUrl(sessionId)
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    window.open(tweetUrl, '_blank', 'noopener,noreferrer')
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  const formattedDate = (() => {
    try {
      return new Date(date).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return date
    }
  })()

  return (
    <div
      className="qs-backdrop"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 5, 12, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Share session"
    >
      <style>{SHEET_STYLES}</style>

      <div
        className="qs-sheet card"
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: '20px 20px 0 0',
          padding: '18px 18px 24px',
          background: '#0d0d1a',
          border: '1px solid #252540',
          borderBottom: 'none',
          boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.55)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>🎳 Share Session</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            aria-label="Close share sheet"
            style={{ minHeight: 36, minWidth: 36, padding: 0, borderRadius: 999 }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            background: 'rgba(167, 139, 250, 0.08)',
            border: '1px solid rgba(167, 139, 250, 0.25)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {location || 'Unknown Lanes'}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {formattedDate}
            {highScore > 0 ? ` · High ${highScore}` : ''}
          </div>
        </div>

        <div className="qs-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNativeShare}
            disabled={busy !== null}
            style={{ minHeight: 48, width: '100%' }}
          >
            {busy === 'share' ? 'Sharing...' : '📤 Native Share'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCopy}
            style={{ minHeight: 48, width: '100%' }}
          >
            {copied ? '✅ Link Copied' : '🔗 Copy Link'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleShareX}
            style={{ minHeight: 48, width: '100%' }}
          >
            𝕏 Share on X
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleDownload}
            disabled={busy !== null}
            style={{ minHeight: 48, width: '100%' }}
          >
            {busy === 'download' ? 'Downloading...' : '⬇️ Download PNG'}
          </button>

          <Link
            to={`/sessions/${sessionId}/share`}
            className="btn btn-ghost"
            onClick={onClose}
            style={{ minHeight: 48, width: '100%', textDecoration: 'none' }}
          >
            🔗 Open Full Share Page
          </Link>
        </div>
      </div>
    </div>
  )
}
