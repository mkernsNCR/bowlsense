import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BowlingScorer, { type SavedBowlingGame } from './BowlingScorer'
import { useSettings } from '../hooks/useSettings'
import { fetchRecentSessions, type Session } from '../api/bowling'
import { Icon } from '../design'
import { localDateValue } from '../features/scoring/date'
import type { ScoringBall } from '../features/scoring/types'
import '../features/scoring/scoring.css'

interface QuickAddGameProps {
  onDone: (gameId: number, startAnother: () => void) => void
}

interface CreatedRecord {
  id: number
}

const SAVE_CONFIRMATION_ANIMATION_MS = 440
const SAVE_COMPLETION_BUFFER_MS = 80
const SAVE_COMPLETION_DELAY_MS = SAVE_CONFIRMATION_ANIMATION_MS + SAVE_COMPLETION_BUFFER_MS

export default function QuickAddGame({ onDone }: QuickAddGameProps) {
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const [showScorer, setShowScorer] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [date, setDate] = useState(localDateValue)
  const [location, setLocation] = useState(settings.homeLanes || 'Home Lanes')
  const [lanes, setLanes] = useState('')
  const [gameNumber, setGameNumber] = useState(1)
  const savedTimerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current)
  }, [])

  const sessionsQuery = useQuery<Session[]>({
    queryKey: ['sessions', 'recent'],
    queryFn: fetchRecentSessions,
  })

  const ballsQuery = useQuery<ScoringBall[]>({
    queryKey: ['balls'],
    queryFn: async () => {
      const response = await fetch('/api/balls')
      if (!response.ok) throw new Error('Balls could not be loaded.')
      return response.json() as Promise<ScoringBall[]>
    },
  })

  const createSession = useMutation({
    mutationFn: async (payload: { date: string; location: string; lanes: string }) => {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Session could not be created.')
      return response.json() as Promise<CreatedRecord>
    },
  })

  const createGame = useMutation({
    mutationFn: async (payload: SavedBowlingGame & { sessionId: number }) => {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Game could not be saved.')
      return response.json() as Promise<CreatedRecord>
    },
  })

  const recentLocation = sessionsQuery.data?.[0]?.location

  const handleSave = async (game: SavedBowlingGame) => {
    let activeSessionId = sessionId
    if (!activeSessionId) {
      const created = await createSession.mutateAsync({ date, location: location.trim(), lanes })
      activeSessionId = created.id
      setSessionId(created.id)
    }

    const createdGame = await createGame.mutateAsync({ sessionId: activeSessionId, ...game })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['games-recent'] }),
      queryClient.invalidateQueries({ queryKey: ['recentGames'] }),
    ])
    if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current)
    savedTimerRef.current = window.setTimeout(() => {
      savedTimerRef.current = null
      setShowScorer(false)
      onDone(createdGame.id, () => {
        setGameNumber((number) => number + 1)
        setShowScorer(true)
      })
    }, SAVE_COMPLETION_DELAY_MS)
  }

  if (showScorer) {
    return (
      <div className="scoring-flow">
        <BowlingScorer
          gameNumber={gameNumber}
          balls={ballsQuery.data ?? []}
          defaultBallId={settings.defaultBallId}
          onSave={handleSave}
          onCancel={() => setShowScorer(false)}
        />
      </div>
    )
  }

  return (
    <div className="scoring-flow">
      <section className="scoring-group" aria-label="Quick game setup">
        <div className="scoring-field">
          <label htmlFor="quick-date">Date</label>
          <input id="quick-date" type="date" value={date} disabled={sessionId !== null} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="scoring-field">
          <label htmlFor="quick-location">Center</label>
          <input id="quick-location" type="text" value={location} disabled={sessionId !== null} onChange={(event) => setLocation(event.target.value)} placeholder="Home Lanes" />
        </div>
      </section>

      {sessionId === null && recentLocation && recentLocation !== location && (
        <button type="button" className="scoring-button quiet" onClick={() => setLocation(recentLocation)}>Use recent center: {recentLocation}</button>
      )}

      {sessionId !== null && <p className="scoring-subtitle">Additional games stay in this created session.</p>}

      <div className="scoring-disclosure">
        <button type="button" className="scoring-button quiet" aria-expanded={showDetails} onClick={() => setShowDetails((visible) => !visible)}>
          {showDetails ? 'Hide details' : 'Add details'} <Icon name="chevron-right" size={16} />
        </button>
      </div>

      {showDetails && (
        <section className="scoring-group">
          <div className="scoring-field">
            <label htmlFor="quick-lanes">Lanes <span aria-hidden="true">·</span> optional</label>
            <input id="quick-lanes" type="text" disabled={sessionId !== null} value={lanes} onChange={(event) => setLanes(event.target.value)} placeholder="5–6" />
          </div>
        </section>
      )}

      {(sessionsQuery.isError || ballsQuery.isError) && <p className="scoring-error" role="alert">Some saved details could not be loaded. You can still start scoring.</p>}

      <button
        type="button"
        className="scoring-button primary wide"
        style={{ marginTop: 16, minHeight: 52 }}
        disabled={!date || !location.trim()}
        onClick={() => setShowScorer(true)}
      >
        Start bowling{gameNumber > 1 ? ` · Game ${gameNumber}` : ''}
      </button>
    </div>
  )
}
