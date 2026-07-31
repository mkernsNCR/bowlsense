import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BowlingScorer from './BowlingScorer'
import { useSettings } from '../hooks/useSettings'
import { fetchRecentSessions, type Ball, type SavedGame, type Session } from '../api/bowling'

interface QuickAddGameProps {
  onDone?: (gameId: number) => void
}

export default function QuickAddGame({ onDone }: QuickAddGameProps) {
  const qc = useQueryClient()
  const { settings } = useSettings()
  const [showBowlingScorer, setShowBowlingScorer] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [lanes, setLanes] = useState('')
  const [gameNumber, setGameNumber] = useState(1)
  const [saved, setSaved] = useState(false)

  const { data: sessions } = useQuery<Session[]>({
    queryKey: ['sessions', 'recent'],
    queryFn: fetchRecentSessions,
  })

  const { data: balls = [] } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then(r => r.json() as Promise<Ball[]>),
  })

  const latestSessionLocation = sessions && sessions.length
    ? [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]?.location ?? ''
    : ''

  const createSessionMutation = useMutation({
    mutationFn: async (payload: { date: string; location: string; lanes: string }) => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create session')
      return response.json() as Promise<{ id: number }>
    },
  })

  const createGameMutation = useMutation({
    mutationFn: async (payload: { sessionId: number; gameNumber: number; score: number; strikes: number; spares: number; splits: number; ballId: number | null; frameData: string; pinLeaves?: string }) => {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create game')
      return response.json() as Promise<{ id: number }>
    },
  })

  const startGame = () => {
    if (!date || !location) return
    setShowBowlingScorer(true)
  }

  const handleSave = async (game: SavedGame) => {
    try {
      let sid = sessionId
      if (!sid) {
        const res = await createSessionMutation.mutateAsync({
          date,
          location,
          lanes,
        })
        sid = res.id
        setSessionId(sid)
      }

      const gameRes = await createGameMutation.mutateAsync({
        sessionId: sid,
        gameNumber,
        score: game.score,
        strikes: game.strikes,
        spares: game.spares,
        splits: game.splits,
        ballId: game.ballId,
        frameData: game.frameData,
        pinLeaves: game.pinLeaves,
      })

      setSaved(true)
      await qc.invalidateQueries({ queryKey: ['sessions'] })
      await qc.invalidateQueries({ queryKey: ['stats'] })
      await qc.invalidateQueries({ queryKey: ['games-recent'] })
      await qc.invalidateQueries({ queryKey: ['recentGames'] })

      const returnedId = gameRes.id
      if (returnedId) {
        onDone?.(returnedId)
      } else {
        const sessionData = await fetch(`/api/sessions/${sid}`).then(r => r.json()) as { games?: { id?: number }[] }
        const highestGameId = sessionData.games?.reduce((max, game) => Math.max(max, game.id || 0), 0)
        if (highestGameId) onDone?.(highestGameId)
      }
    } catch (err) {
      console.error('Failed to save game:', err)
    }
  }

  if (saved && !showBowlingScorer) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>🎳</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Game Saved!</div>
        <div className="muted" style={{ marginBottom: 16 }}>{location} · Game {gameNumber}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() => {
              setSaved(false)
              setShowBowlingScorer(true)
              setGameNumber(n => n + 1)
            }}
            style={{
              background: 'rgba(167,139,250,0.15)',
              border: '1px solid rgba(167,139,250,0.4)',
              color: 'var(--accent)',
              fontWeight: 800,
              borderRadius: 12,
              minHeight: 44,
              padding: '8px 16px',
            }}
          >
            ➕ Add Another
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => window.location.href = '/sessions'}
            style={{ minHeight: 44, padding: '8px 16px' }}
          >
            View Sessions
          </button>
        </div>
      </div>
    )
  }

  if (showBowlingScorer) {
    return (
      <div>
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 12px', fontSize: 13 }}>
          <span>📅 {date}</span>
          <span>📍 {location}</span>
          {lanes && <span>🎳 Lanes {lanes}</span>}
          <span>Game {gameNumber}</span>
        </div>
        <BowlingScorer
          gameNumber={gameNumber}
          balls={balls}
          defaultBallId={settings.defaultBallId}
          onSave={handleSave}
          onCancel={() => setShowBowlingScorer(false)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%',
              background: '#131326',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text)',
              padding: '8px 10px',
              fontSize: 14,
              boxSizing: 'border-box',
              minHeight: 40,
            }}
          />
        </div>
        <div>
          <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Bowlero, AMF, etc."
            style={{
              width: '100%',
              background: '#131326',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text)',
              padding: '8px 10px',
              fontSize: 14,
              boxSizing: 'border-box',
              minHeight: 40,
            }}
          />
        </div>
      </div>
      <div>
        <label className="muted" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Lanes (optional)</label>
        <input
          type="text"
          value={lanes}
          onChange={e => setLanes(e.target.value)}
          placeholder="e.g. 1–2"
          style={{
            width: '100%',
            background: '#131326',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--text)',
            padding: '8px 10px',
            fontSize: 14,
            boxSizing: 'border-box',
            minHeight: 40,
          }}
        />
      </div>
      {!!latestSessionLocation && !location && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setLocation(latestSessionLocation)}
          style={{ minHeight: 36, fontSize: 13, padding: '4px 10px' }}
        >
          ↩ Use recent: {latestSessionLocation}
        </button>
      )}
      <button
        className="btn btn-primary"
        onClick={startGame}
        disabled={!date || !location}
        style={{
          minHeight: 48,
          fontWeight: 800,
          fontSize: 16,
          borderRadius: 12,
          opacity: (!date || !location) ? 0.5 : 1,
        }}
      >
        🎳 Start Game {gameNumber > 1 ? `#${gameNumber}` : ''}
      </button>
    </div>
  )
}
