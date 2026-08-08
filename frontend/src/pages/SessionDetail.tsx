import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSettings } from '../hooks/useSettings'
import BowlingScorer, { type SavedBowlingGame } from '../components/BowlingScorer'
import ShareCard from '../components/ShareCard'
import { FrameRibbon, Icon, Sheet } from '../design'
import { copyText } from '../features/scoring/copyText'
import { formatSessionDate } from '../features/scoring/date'
import { toFrameRibbonFrames } from '../features/scoring/frameRibbon'
import { laneNoteBadges, parseLaneNotes } from '../features/scoring/laneNotes'
import { parseThrowNotes, throwNoteSummary } from '../features/scoring/throwNotes'
import type { ScoringBall } from '../features/scoring/types'
import { gameFromFrameData } from '../utils/bowlingScore'
import { downloadSessionCard, getSessionShareUrl, nativeShareSession } from '../utils/sessionShare'
import { getGameShareUrl, shareOnX } from '../utils/gameShare'
import '../features/scoring/scoring.css'

interface Game {
  id: number
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number | null
  frameData?: string | null
}

interface SessionWithGames {
  id: number
  date: string
  location: string | null
  lanes: string | null
  notes: string | null
  games: Game[]
}

interface SessionForm {
  date: string
  location: string
  lanes: string
  notes: string
}

interface CreatedGame {
  id: number
}

function getNextGameNumber(games: ReadonlyArray<{ gameNumber: number }>) {
  return Math.max(0, ...games.map((game) => game.gameNumber)) + 1
}

function resolveSessionForm(draft: SessionForm | null, session: SessionForm) {
  return draft ?? session
}

export default function SessionDetail() {
  const { id } = useParams()
  const sessionId = Number(id)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const [showScorer, setShowScorer] = useState(() => searchParams.get('start') === '1')
  const [showSessionActions, setShowSessionActions] = useState(false)
  const [showEditSession, setShowEditSession] = useState(() => searchParams.get('edit') === '1')
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false)
  const [actionGame, setActionGame] = useState<Game | null>(null)
  const [confirmDeleteGame, setConfirmDeleteGame] = useState(false)
  const [editingGame, setEditingGame] = useState<Game | null>(null)
  const [shareGame, setShareGame] = useState<Game | null>(null)
  const [sessionForm, setSessionForm] = useState<SessionForm | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'busy' | 'copied' | 'error'>('idle')
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  const sessionQuery = useQuery<SessionWithGames>({
    queryKey: ['session', id],
    enabled: Number.isFinite(sessionId),
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${id}`)
      if (!response.ok) throw new Error('Session could not be loaded.')
      return response.json() as Promise<SessionWithGames>
    },
    staleTime: 0,
  })

  const ballsQuery = useQuery<ScoringBall[]>({
    queryKey: ['balls'],
    queryFn: async () => {
      const response = await fetch('/api/balls')
      if (!response.ok) throw new Error('Balls could not be loaded.')
      return response.json() as Promise<ScoringBall[]>
    },
  })

  const refreshSession = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['session', id] }),
      queryClient.invalidateQueries({ queryKey: ['sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
    ])
  }

  const addGame = useMutation({
    mutationFn: async (game: SavedBowlingGame) => {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...game }),
      })
      if (!response.ok) throw new Error('Game could not be saved.')
      return response.json() as Promise<CreatedGame>
    },
    onSuccess: refreshSession,
  })

  const updateSession = useMutation({
    mutationFn: async (form: SessionForm) => {
      const response = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) throw new Error('Session could not be updated.')
    },
    onSuccess: async () => {
      setShowEditSession(false)
      setSessionForm(null)
      setSearchParams({}, { replace: true })
      await refreshSession()
    },
  })

  const removeSession = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Session could not be deleted.')
    },
    onSuccess: async () => {
      await refreshSession()
      navigate('/sessions')
    },
  })

  const updateGame = useMutation({
    mutationFn: async ({ gameId, game }: { gameId: number; game: SavedBowlingGame }) => {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(game),
      })
      if (!response.ok) throw new Error('Game could not be updated.')
    },
    onSuccess: async () => {
      setEditingGame(null)
      await refreshSession()
    },
  })

  const removeGame = useMutation({
    mutationFn: async (gameId: number) => {
      const response = await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Game could not be deleted.')
    },
    onSuccess: async () => {
      setActionGame(null)
      setConfirmDeleteGame(false)
      await refreshSession()
    },
  })

  const session = sessionQuery.data
  const games = session?.games ?? []
  const orderedGames = [...games].sort((first, second) => first.gameNumber - second.gameNumber || first.id - second.id)
  const balls = ballsQuery.data ?? []
  const seriesTotal = orderedGames.reduce((sum, game) => sum + game.score, 0)
  const average = orderedGames.length ? Math.round(seriesTotal / orderedGames.length) : null
  const high = orderedGames.length ? Math.max(...orderedGames.map((game) => game.score)) : null
  const totalStrikes = orderedGames.reduce((sum, game) => sum + game.strikes, 0)
  const totalSpares = orderedGames.reduce((sum, game) => sum + game.spares, 0)
  const totalSplits = orderedGames.reduce((sum, game) => sum + game.splits, 0)
  const perfectGames = orderedGames.filter((game) => game.score === 300).length
  const firstGame = orderedGames[0]
  const lastGame = orderedGames[orderedGames.length - 1]
  const sessionTrend = firstGame && lastGame && orderedGames.length > 1 ? lastGame.score - firstGame.score : null
  const activeSessionForm = resolveSessionForm(sessionForm, {
    date: session?.date ?? '',
    location: session?.location ?? '',
    lanes: session?.lanes ?? '',
    notes: session?.notes ?? '',
  })

  const openEditSession = () => {
    if (!session) return
    setSessionForm({
      date: session.date,
      location: session.location ?? '',
      lanes: session.lanes ?? '',
      notes: session.notes ?? '',
    })
    setShowSessionActions(false)
    setShowEditSession(true)
  }

  const closeEditSession = () => {
    setShowEditSession(false)
    setSessionForm(null)
    setSearchParams({}, { replace: true })
  }

  const handleSessionShare = async () => {
    if (!session) return
    setShareStatus('busy')
    try {
      const outcome = await nativeShareSession({
        sessionId,
        filename: `bowlsense-session-${sessionId}.png`,
        title: 'BowlSense session',
        text: `${session.location?.trim() || 'Center not named'} · ${session.date}`,
      })
      if (outcome === 'unsupported') {
        await copyText(getSessionShareUrl(sessionId))
        setShareStatus('copied')
        window.setTimeout(() => setShareStatus('idle'), 1400)
        return
      }
      setShareStatus('idle')
    } catch {
      setShareStatus('error')
    }
  }

  const handleSessionDownload = async () => {
    try {
      await downloadSessionCard(sessionId, `bowlsense-session-${sessionId}.png`)
      setSavedNotice('Score card downloaded')
    } catch {
      setSavedNotice('Score card download failed')
    }
    window.setTimeout(() => setSavedNotice(null), 1800)
  }

  const handleCopyGameLink = async (gameId: number) => {
    try {
      await copyText(getGameShareUrl(gameId))
      setSavedNotice('Public link copied')
    } catch {
      setSavedNotice('Public link could not be copied')
    }
    setActionGame(null)
    window.setTimeout(() => setSavedNotice(null), 1800)
  }

  if (!Number.isFinite(sessionId)) return <div className="scoring-flow scoring-page scoring-error">This session link is not valid.</div>
  if (sessionQuery.isLoading) return <div className="scoring-flow scoring-page scoring-status">Loading session…</div>
  if (sessionQuery.isError || !session) {
    return (
      <div className="scoring-flow scoring-page scoring-status scoring-error">
        This session could not be loaded.
        <button type="button" className="scoring-button quiet" onClick={() => sessionQuery.refetch()}>Try again</button>
      </div>
    )
  }

  if (showScorer) {
    return (
      <div className="scoring-flow scoring-page scoring-page--focused">
        <BowlingScorer
          gameNumber={getNextGameNumber(games)}
          balls={balls}
          defaultBallId={settings.defaultBallId}
          shareContext={{ location: session.location, date: session.date, lanes: session.lanes }}
          onSave={async (game) => {
            await addGame.mutateAsync(game)
            setShowScorer(false)
            setSearchParams({}, { replace: true })
            setSavedNotice(`Game ${game.gameNumber} saved`)
            window.setTimeout(() => setSavedNotice(null), 1800)
          }}
          onCancel={() => {
            setShowScorer(false)
            setSearchParams({}, { replace: true })
          }}
        />
      </div>
    )
  }

  return (
    <div className="scoring-flow scoring-page">
      <div className="scoring-page-header">
        <div>
          <p className="scoring-eyebrow">{formatSessionDate(session.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <h1 className="scoring-large-title">{session.location || 'Session'}</h1>
          <p className="scoring-subtitle">
            {session.lanes ? `Lanes ${session.lanes}` : 'Lanes not recorded'}{session.notes ? ` · ${session.notes}` : ''}
          </p>
        </div>
        <button type="button" className="scoring-icon-button" onClick={() => setShowSessionActions(true)} aria-label="Session actions"><Icon name="more" /></button>
      </div>

      <section className="session-dashboard" aria-labelledby="session-dashboard-title">
        <div className="session-dashboard__hero">
          <div>
            <p className="session-dashboard__eyebrow">Session tracker</p>
            <h2 id="session-dashboard-title">Your set, at a glance</h2>
            <p className="session-dashboard__intro">
              {orderedGames.length ? 'A live read on the night so far.' : 'Add your first game to start tracking the night.'}
            </p>
          </div>
          <div className="session-dashboard__series" aria-label={`Total series ${orderedGames.length ? seriesTotal : 'not available'}`}>
            <span>Total series</span>
            <strong>{orderedGames.length ? seriesTotal : '—'}</strong>
            <small>{orderedGames.length ? `${orderedGames.length}-game set` : 'No games logged'}</small>
          </div>
        </div>

        <div className="session-dashboard__stats">
          <div className="session-dashboard__stat"><span>Average</span><strong>{average ?? '—'}</strong><small>per game</small></div>
          <div className="session-dashboard__stat"><span>High game</span><strong>{high ?? '—'}</strong><small>{perfectGames ? `${perfectGames} perfect` : 'best score'}</small></div>
          <div className="session-dashboard__stat"><span>Games logged</span><strong>{orderedGames.length}</strong><small>this session</small></div>
          <div className="session-dashboard__stat">
            <span>Momentum</span>
            <strong className={sessionTrend == null ? '' : sessionTrend > 0 ? 'is-positive' : sessionTrend < 0 ? 'is-negative' : ''}>
              {sessionTrend == null ? '—' : sessionTrend === 0 ? 'Steady' : `${sessionTrend > 0 ? '+' : ''}${sessionTrend}`}
            </strong>
            <small>{sessionTrend == null ? 'needs 2 games' : 'last vs first game'}</small>
          </div>
        </div>

        {orderedGames.length > 0 && (
          <>
            <div className="session-dashboard__card session-dashboard__chart-card">
              <div className="session-dashboard__card-heading">
                <div>
                  <p className="session-dashboard__eyebrow">Game-by-game</p>
                  <h3>Score path</h3>
                </div>
                {average != null && <span className="session-dashboard__legend"><i aria-hidden="true" /> Avg {average}</span>}
              </div>
              <div
                className="session-score-chart"
                role="img"
                aria-label={`Score path: ${orderedGames.map((game) => `Game ${game.gameNumber}, ${game.score}`).join('; ')}`}
              >
                {average != null && (
                  <div className="session-score-chart__average" style={{ bottom: `${Math.min(100, Math.max(0, (average / 300) * 100))}%` }}>
                    <span>Avg {average}</span>
                  </div>
                )}
                <div className="session-score-chart__bars">
                  {orderedGames.map((game) => (
                    <div className="session-score-bar" key={game.id}>
                      <span className="session-score-bar__value">{game.score}</span>
                      <div className="session-score-bar__track" aria-hidden="true">
                        <div
                          className={`session-score-bar__fill${game.score === high ? ' is-high' : ''}`}
                          style={{ height: `${Math.max(8, Math.min(100, (game.score / 300) * 100))}%` }}
                        />
                      </div>
                      <span className="session-score-bar__label">G{game.gameNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="session-score-chart__scale"><span>0</span><span>300 perfect game</span></div>
            </div>

            <div className="session-dashboard__card session-dashboard__breakdown">
              <div>
                <p className="session-dashboard__eyebrow">Pin story</p>
                <h3>How you got there</h3>
              </div>
              <div className="session-dashboard__breakdown-grid">
                <div><strong>{totalStrikes}</strong><span>Strikes</span></div>
                <div><strong>{totalSpares}</strong><span>Spares</span></div>
                <div><strong>{totalSplits}</strong><span>Splits</span></div>
              </div>
            </div>
          </>
        )}
      </section>

      {savedNotice && (
        <div className="live-edit-banner" role="status">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="check" size={18} /> {savedNotice}</span>
        </div>
      )}

      <h2 className="scoring-section-title">Games</h2>
      {games.length === 0 ? (
        <div className="scoring-group scoring-empty">
          <strong>No games in this session</strong>
          <p>Start the scorer and record your first ball.</p>
        </div>
      ) : (
        <div className="scoring-group">
          {orderedGames.map((game) => {
            const ballName = balls.find((ball) => ball.id === game.ballId)?.name
            const laneBadges = laneNoteBadges(parseLaneNotes(game.frameData))
            const throwSummaries = parseThrowNotes(game.frameData)
              .map((notes, index) => ({ index, summary: throwNoteSummary(notes, index) }))
              .filter((item): item is { index: number; summary: string } => item.summary != null)
            return (
              <article className="scoring-row" key={game.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="scoring-row-copy" style={{ flexBasis: 'calc(100% - 64px)' }}>
                  <p className="scoring-row-title">Game {game.gameNumber} <span className="scoring-row-value" style={{ marginLeft: 8 }}>{game.score}</span></p>
                  <p className="scoring-row-meta">{game.strikes} strikes · {game.spares} spares{ballName ? ` · ${ballName}` : ''}</p>
                </div>
                <button type="button" className="scoring-row-action" onClick={() => { setActionGame(game); setConfirmDeleteGame(false) }} aria-label={`Actions for game ${game.gameNumber}`}><Icon name="more" /></button>
                <div style={{ flexBasis: '100%', minWidth: 0 }}>
                  <FrameRibbon frames={toFrameRibbonFrames(gameFromFrameData(game.frameData).frames)} label={`Game ${game.gameNumber}, score ${game.score}`} compact />
                  {laneBadges.length > 0 && (
                    <div className="game-lane-badges" aria-label={`Game ${game.gameNumber} lane notes`}>
                      {laneBadges.map((badge) => <span key={badge}>{badge}</span>)}
                    </div>
                  )}
                  {throwSummaries.length > 0 && (
                    <details className="game-throw-notes">
                      <summary>{throwSummaries.length} throw {throwSummaries.length === 1 ? 'note' : 'notes'}</summary>
                      <div className="game-throw-notes__list" aria-label={`Game ${game.gameNumber} per-throw notes`}>
                        {throwSummaries.map(({ index, summary }) => <span key={index}>{summary}</span>)}
                      </div>
                    </details>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <button type="button" className="scoring-button primary wide" style={{ marginTop: 18, minHeight: 52 }} onClick={() => { setSearchParams({}, { replace: true }); setShowScorer(true) }}>
        <Icon name="plus" /> Start new game
      </button>

      {editingGame && (
        <Sheet
          open
          onClose={() => setEditingGame(null)}
          title={`Edit game ${editingGame.gameNumber}`}
          description="Open Score details and choose a frame. Later rolls will be held until you confirm the new score."
          closeLabel="Close game editor"
          className="scoring-sheet-theme scoring-sheet-wide"
        >
          <BowlingScorer
            key={editingGame.id}
            gameNumber={editingGame.gameNumber}
            balls={balls}
            defaultBallId={editingGame.ballId == null ? undefined : String(editingGame.ballId)}
            initialFrameData={editingGame.frameData}
            initialSplits={editingGame.splits}
            shareContext={{ location: session.location, date: session.date, lanes: session.lanes }}
            onSave={async (game) => {
              await updateGame.mutateAsync({ gameId: editingGame.id, game })
              setSavedNotice(`Game ${game.gameNumber} updated`)
              window.setTimeout(() => setSavedNotice(null), 1800)
            }}
            onCancel={() => setEditingGame(null)}
          />
        </Sheet>
      )}

      {showSessionActions && (
        <Sheet open onClose={() => setShowSessionActions(false)} title="Actions" description="Session" closeLabel="Close session actions" className="scoring-sheet-theme">
          <div className="scoring-fields">
            <button type="button" className="scoring-row scoring-row-action" autoFocus onClick={openEditSession}><span className="scoring-row-copy">Edit details</span><Icon name="chevron-right" /></button>
            <button type="button" className="scoring-row scoring-row-action" disabled={shareStatus === 'busy'} onClick={handleSessionShare}>
              <Icon name="share" /><span className="scoring-row-copy">{shareStatus === 'copied' ? 'Link copied' : shareStatus === 'error' ? 'Share failed — retry' : shareStatus === 'busy' ? 'Preparing…' : 'Share session'}</span><Icon name="chevron-right" />
            </button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => void handleSessionDownload()}>
              <Icon name="download" /><span className="scoring-row-copy">Download score card</span><Icon name="chevron-right" />
            </button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => navigate(`/sessions/${sessionId}/share`)}>
              <span className="scoring-row-copy">Open share page</span><Icon name="chevron-right" />
            </button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => setConfirmDeleteSession(true)}>
              <Icon name="trash" /><span className="scoring-row-copy">Delete session</span><Icon name="chevron-right" />
            </button>
          </div>
          {confirmDeleteSession && (
            <div role="alert">
              <p className="scoring-subtitle">Delete this session and all {games.length} {games.length === 1 ? 'game' : 'games'}? This cannot be undone.</p>
              {removeSession.isError && <p className="scoring-error">The session was not deleted. Try again.</p>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" onClick={() => setConfirmDeleteSession(false)}>Keep session</button>
                <button type="button" className="scoring-button danger" disabled={removeSession.isPending} onClick={() => removeSession.mutate()}>{removeSession.isPending ? 'Deleting…' : 'Delete session'}</button>
              </div>
            </div>
          )}
          {!confirmDeleteSession && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} onClick={() => setShowSessionActions(false)}>Done</button>}
        </Sheet>
      )}

      {showEditSession && (
        <Sheet open onClose={closeEditSession} title="Edit session" closeLabel="Close session editor" className="scoring-sheet-theme">
          <div className="scoring-fields">
            <div className="scoring-field"><label htmlFor="edit-session-date">Date</label><input id="edit-session-date" type="date" value={activeSessionForm.date} onChange={(event) => setSessionForm({ ...activeSessionForm, date: event.target.value })} /></div>
            <div className="scoring-field"><label htmlFor="edit-session-location">Center</label><input id="edit-session-location" value={activeSessionForm.location} onChange={(event) => setSessionForm({ ...activeSessionForm, location: event.target.value })} /></div>
            <div className="scoring-field"><label htmlFor="edit-session-lanes">Lanes</label><input id="edit-session-lanes" value={activeSessionForm.lanes} onChange={(event) => setSessionForm({ ...activeSessionForm, lanes: event.target.value })} /></div>
            <div className="scoring-field"><label htmlFor="edit-session-notes">Notes</label><textarea id="edit-session-notes" value={activeSessionForm.notes} onChange={(event) => setSessionForm({ ...activeSessionForm, notes: event.target.value })} /></div>
          </div>
          {updateSession.isError && <p className="scoring-error">Changes were not saved. Try again.</p>}
          <div className="scoring-sheet-actions">
            <button type="button" className="scoring-button secondary" autoFocus onClick={closeEditSession}>Cancel</button>
            <button type="button" className="scoring-button primary" disabled={!activeSessionForm.date || !activeSessionForm.location.trim() || updateSession.isPending} onClick={() => updateSession.mutate(activeSessionForm)}>{updateSession.isPending ? 'Saving…' : 'Save changes'}</button>
          </div>
        </Sheet>
      )}

      {actionGame && (
        <Sheet open onClose={() => setActionGame(null)} title="Game actions" description={`Game ${actionGame.gameNumber} · ${actionGame.score}`} closeLabel="Close game actions" className="scoring-sheet-theme">
          <div className="scoring-fields">
            <button type="button" className="scoring-row scoring-row-action" autoFocus onClick={() => { setEditingGame(actionGame); setActionGame(null) }}><span className="scoring-row-copy">Edit score</span><Icon name="chevron-right" /></button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => { setShareGame(actionGame); setActionGame(null) }}><Icon name="share" /><span className="scoring-row-copy">Share score card</span><Icon name="chevron-right" /></button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => shareOnX(actionGame.id, actionGame.score, session.location?.trim() || 'Center not named')}><span className="scoring-row-copy">Share on X</span><Icon name="chevron-right" /></button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => void handleCopyGameLink(actionGame.id)}><span className="scoring-row-copy">Copy public link</span><Icon name="chevron-right" /></button>
            <button type="button" className="scoring-row scoring-row-action" onClick={() => setConfirmDeleteGame(true)}><Icon name="trash" /><span className="scoring-row-copy">Delete game</span><Icon name="chevron-right" /></button>
          </div>
          {confirmDeleteGame && (
            <div role="alert">
              <p className="scoring-subtitle">Delete game {actionGame.gameNumber}? Session statistics will update. This cannot be undone.</p>
              {removeGame.isError && <p className="scoring-error">The game was not deleted. Try again.</p>}
              <div className="scoring-sheet-actions">
                <button type="button" className="scoring-button secondary" onClick={() => setConfirmDeleteGame(false)}>Keep game</button>
                <button type="button" className="scoring-button danger" disabled={removeGame.isPending} onClick={() => removeGame.mutate(actionGame.id)}>{removeGame.isPending ? 'Deleting…' : 'Delete game'}</button>
              </div>
            </div>
          )}
          {!confirmDeleteGame && <button type="button" className="scoring-button secondary wide" style={{ marginTop: 16 }} onClick={() => setActionGame(null)}>Done</button>}
        </Sheet>
      )}

      {shareGame && (
        <ShareCard
          game={shareGame}
          session={{ location: session.location?.trim() || 'Center not named', date: session.date, lanes: session.lanes ?? '' }}
          ballName={balls.find((ball) => ball.id === shareGame.ballId)?.name}
          onClose={() => setShareGame(null)}
        />
      )}

      <p className="scoring-subtitle" style={{ marginTop: 24 }}><Link to="/sessions">Back to sessions</Link></p>
    </div>
  )
}
