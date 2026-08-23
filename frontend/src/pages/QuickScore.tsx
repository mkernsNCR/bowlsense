import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'

/**
 * QuickScore — one-handed, score-only entry for the alley.
 *
 * Big tap targets, number pad for score, game# auto-increments.
 * Defaults: today + last location. Auto-creates today's session.
 * Returns to this screen after save with game# bumped.
 */

interface Ball {
  id: number
  name: string
  brand?: string
}

interface SessionRow {
  id: number
  date: string
  location: string
  gameCount?: number
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function QuickScore() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const scoreRef = useRef<HTMLInputElement>(null)

  const [score, setScore] = useState('')
  const [gameNumber, setGameNumber] = useState<number>(1)
  const [ballId, setBallId] = useState<number | null>(null)
  const [location, setLocation] = useState('')
  const [lanes, setLanes] = useState('')
  const [date, setDate] = useState<string>(todayIso())
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [savedFlash, setSavedFlash] = useState<{ score: number; gn: number } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Load balls for picker
  const { data: balls = [] } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then(r => r.json()),
  })

  // Load recent sessions to find last location + figure out game#
  const { data: recentSessions } = useQuery<any>({
    queryKey: ['sessions', 'recent'],
    queryFn: async () => {
      const res = await fetch('/api/sessions?limit=10&sort=date&order=desc')
      const json = await res.json()
      return Array.isArray(json) ? json : (json.sessions ?? [])
    },
  })

  const sessions: SessionRow[] = useMemo(() => {
    if (!Array.isArray(recentSessions)) return []
    return recentSessions.map((s: any) => ({
      id: s.id,
      date: s.date,
      location: s.location ?? '',
      gameCount: Number(s.gameCount ?? s.game_count ?? 0),
    }))
  }, [recentSessions])

  // Auto-default: location = last session location, sessionId = today's session at that location (if any)
  useEffect(() => {
    if (sessions.length === 0) return
    const last = sessions[0]
    if (!location && last.location) setLocation(last.location)
    const todaySame = sessions.find(s => s.date === date && s.location === (location || last.location))
    if (todaySame && !sessionId) {
      setSessionId(todaySame.id)
      setGameNumber(Math.max(1, (todaySame.gameCount ?? 0) + 1))
    }
  }, [sessions, date, location, sessionId])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const numericScore = Number(score)
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 300) {
        throw new Error('Enter a score between 0 and 300')
      }
      const res = await fetch('/api/games/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: numericScore,
          ballId,
          location,
          lanes: lanes || undefined,
          date,
          sessionId,
          gameNumber,
          autoCreateSession: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Save failed')
      return data
    },
    onSuccess: (data) => {
      const savedScore = Number(score)
      const gn = Number(data?.gameNumber ?? gameNumber)
      setSavedFlash({ score: savedScore, gn })
      setScore('')
      setGameNumber(gn + 1)
      setSessionId(data?.session?.id ?? sessionId)
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['games-recent'] })
      qc.invalidateQueries({ queryKey: ['quick-start-sessions'] })
      // Refresh focus back to score input
      setTimeout(() => scoreRef.current?.focus(), 80)
      // Clear flash after a moment
      setTimeout(() => setSavedFlash(null), 2200)
    },
  })

  // Numpad-style helpers
  const appendDigit = (d: string) => {
    if (savedFlash) setSavedFlash(null)
    if (score === '0') setScore(d)
    else if (score.length < 3) setScore(s => s + d)
  }
  const backspace = () => {
    if (savedFlash) setSavedFlash(null)
    setScore(s => s.slice(0, -1))
  }
  const clearScore = () => {
    setSavedFlash(null)
    setScore('')
  }

  // Keyboard support: enter to save, backspace to delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && score && !saveMutation.isPending) {
        e.preventDefault()
        saveMutation.mutate()
      } else if (e.key === 'Backspace' && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        backspace()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [score, saveMutation])

  const numericScore = Number(score)
  const scoreValid = score !== '' && Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 300

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0d1a',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '16px 16px 32px',
      maxWidth: 520,
      margin: '0 auto',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <Link to="/quick" style={{ color: '#a78bfa', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
          ← Quick
        </Link>
        <div style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          ⚡ QUICK SCORE
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Flash */}
      {savedFlash && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 12,
            marginBottom: 14,
            textAlign: 'center',
            fontWeight: 800,
            fontSize: 16,
            boxShadow: '0 6px 20px rgba(16,185,129,0.35)',
            animation: 'qs-fade 0.2s ease-out',
          }}
        >
          ✅ Saved {savedFlash.score} (game {savedFlash.gn}) — enter next score ↓
        </div>
      )}

      {/* Score header */}
      <div style={{
        background: '#121228',
        border: '1px solid rgba(167,139,250,0.18)',
        borderRadius: 18,
        padding: '20px 16px 12px',
        marginBottom: 14,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
          {date} · Game {gameNumber}
        </div>
        <div
          aria-live="polite"
          style={{
            fontSize: 'clamp(72px, 22vw, 120px)',
            fontWeight: 900,
            lineHeight: 1,
            background: scoreValid && numericScore === 300
              ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
              : scoreValid
                ? 'linear-gradient(135deg, #a78bfa, #7c3aed)'
                : 'rgba(167,139,250,0.25)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: -2,
            minHeight: '1em',
          }}
        >
          {score || '—'}
        </div>
        {numericScore === 300 && scoreValid && (
          <div style={{ marginTop: 6, fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>
            🏆 Perfect game!
          </div>
        )}
      </div>

      {/* Numpad */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        marginBottom: 14,
      }}>
        {['1','2','3','4','5','6','7','8','9'].map(d => (
          <button
            key={d}
            onClick={() => appendDigit(d)}
            disabled={score.length >= 3}
            style={{
              minHeight: 64,
              fontSize: 28,
              fontWeight: 800,
              background: '#1a1a35',
              border: '1px solid rgba(167,139,250,0.18)',
              borderRadius: 14,
              color: '#fff',
              cursor: score.length >= 3 ? 'not-allowed' : 'pointer',
              opacity: score.length >= 3 ? 0.4 : 1,
              transition: 'transform 0.1s',
              WebkitTapHighlightColor: 'transparent',
            }}
            onTouchStart={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)' }}
            onTouchEnd={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
          >
            {d}
          </button>
        ))}
        <button
          onClick={clearScore}
          style={{
            minHeight: 64,
            fontSize: 18,
            fontWeight: 700,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 14,
            color: '#fca5a5',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          CLR
        </button>
        <button
          onClick={() => appendDigit('0')}
          disabled={score.length >= 3 || score === ''}
          style={{
            minHeight: 64,
            fontSize: 28,
            fontWeight: 800,
            background: '#1a1a35',
            border: '1px solid rgba(167,139,250,0.18)',
            borderRadius: 14,
            color: '#fff',
            cursor: (score.length >= 3 || score === '') ? 'not-allowed' : 'pointer',
            opacity: (score.length >= 3 || score === '') ? 0.4 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          0
        </button>
        <button
          onClick={backspace}
          disabled={!score}
          style={{
            minHeight: 64,
            fontSize: 22,
            fontWeight: 700,
            background: 'rgba(167,139,250,0.12)',
            border: '1px solid rgba(167,139,250,0.35)',
            borderRadius: 14,
            color: '#c4b5fd',
            cursor: !score ? 'not-allowed' : 'pointer',
            opacity: !score ? 0.4 : 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ⌫
        </button>
      </div>

      {/* Save button */}
      <button
        onClick={() => saveMutation.mutate()}
        disabled={!scoreValid || saveMutation.isPending}
        style={{
          width: '100%',
          minHeight: 64,
          fontSize: 20,
          fontWeight: 900,
          background: scoreValid
            ? 'linear-gradient(135deg, #7c3aed, #5b21b6)'
            : '#1a1a35',
          border: 'none',
          borderRadius: 14,
          color: scoreValid ? '#fff' : 'rgba(255,255,255,0.4)',
          cursor: scoreValid ? 'pointer' : 'not-allowed',
          marginBottom: 14,
          boxShadow: scoreValid ? '0 8px 28px rgba(124,58,237,0.4)' : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {saveMutation.isPending ? 'Saving…' : `🎳 Save Game ${gameNumber}`}
      </button>

      {saveMutation.isError && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.4)',
          padding: '10px 14px',
          borderRadius: 10,
          color: '#fca5a5',
          fontSize: 13,
          marginBottom: 14,
          textAlign: 'center',
        }}>
          {(saveMutation.error as Error)?.message || 'Save failed'}
        </div>
      )}

      {/* Context row: ball + location */}
      <div style={{
        background: '#121228',
        border: '1px solid rgba(167,139,250,0.18)',
        borderRadius: 14,
        padding: '14px 14px 6px',
        marginBottom: 14,
      }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
            🎱 Ball
          </label>
          <select
            value={ballId ?? ''}
            onChange={e => setBallId(e.target.value ? Number(e.target.value) : null)}
            style={{
              width: '100%',
              background: '#0d0d1a',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 10,
              color: '#fff',
              padding: '10px 12px',
              fontSize: 15,
              minHeight: 44,
              boxSizing: 'border-box',
            }}
          >
            <option value="">— None —</option>
            {balls.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.brand ? ` (${b.brand})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
            📍 Location
          </label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Bowlero, AMF, etc."
            style={{
              width: '100%',
              background: '#0d0d1a',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 10,
              color: '#fff',
              padding: '10px 12px',
              fontSize: 15,
              minHeight: 44,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(s => !s)}
        style={{
          width: '100%',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.6)',
          padding: '8px 12px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: showAdvanced ? 12 : 0,
        }}
      >
        {showAdvanced ? '▲ Hide details' : '▼ Details (date, lanes)'}
      </button>

      {showAdvanced && (
        <div style={{
          background: '#121228',
          border: '1px solid rgba(167,139,250,0.18)',
          borderRadius: 14,
          padding: 14,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 14,
        }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
              📅 Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                width: '100%',
                background: '#0d0d1a',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: 10,
                color: '#fff',
                padding: '10px 12px',
                fontSize: 14,
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
              🎳 Lanes
            </label>
            <input
              type="text"
              value={lanes}
              onChange={e => setLanes(e.target.value)}
              placeholder="e.g. 1–2"
              style={{
                width: '100%',
                background: '#0d0d1a',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: 10,
                color: '#fff',
                padding: '10px 12px',
                fontSize: 14,
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer links */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.8)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🏠 Dashboard
        </button>
        <button
          onClick={() => navigate(`/sessions/${sessionId ?? ''}`)}
          disabled={!sessionId}
          style={{
            background: 'rgba(167,139,250,0.12)',
            border: '1px solid rgba(167,139,250,0.3)',
            color: sessionId ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: sessionId ? 'pointer' : 'not-allowed',
          }}
        >
          📋 View Session
        </button>
      </div>

      <style>{`
        @keyframes qs-fade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input, select, button { font-family: inherit; }
        button:active { transform: scale(0.97); }
      `}</style>
    </div>
  )
}
