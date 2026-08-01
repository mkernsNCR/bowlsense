import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../design'
import { useSettings } from '../hooks/useSettings'
import { QuickLogSheet, type QuickLogDraft } from '../features/today/QuickLogSheet'
import { RecentSessions } from '../features/today/RecentSessions'
import { TodayFrameRibbon } from '../features/today/TodayFrameRibbon'
import {
  fetchJson,
  fetchRecentSessions,
  type Ball,
  type SavedGame,
  type Session,
} from '../api/bowling'
import {
  type Game,
  type GameResponse,
  type Stats,
  type TonightLeague,
  type WeeklyStats,
  normalizeGame,
  parseCalendarDate,
} from '../features/today/data'
import '../features/today/today.css'

function formatDate(date: string | undefined) {
  if (!date) return ''
  return parseCalendarDate(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function localCalendarDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createQuickLogDraft(location = ''): QuickLogDraft {
  return {
    date: localCalendarDate(),
    location,
    lanes: '',
    sessionId: null,
    gameNumber: 1,
    saved: false,
  }
}

function gameFrameData(game: Game | undefined) {
  return game?.frameData ?? null
}

function TodayActions({ onQuickLog }: { onQuickLog: () => void }) {
  return (
    <div className="today-next-action">
      <Link to="/sessions/new" className="today-button today-button--primary">
        <Icon className="today-icon" name="start" />
        Start bowling
      </Link>
      <button type="button" className="today-button today-button--text" onClick={onQuickLog}>
        Log a past game
      </button>
    </div>
  )
}

function DashboardLoading() {
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    const timeout = window.setTimeout(() => setAnnouncement('Loading your latest bowling activity.'), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  return (
    <div className="today-page" aria-busy="true" aria-label="Loading Today">
      <div className="today-layout">
        <div className="today-primary">
          <header className="today-header">
            <div className="today-kicker">BowlSense</div>
            <h1>Today</h1>
            <div className="today-skeleton today-skeleton--context" />
          </header>
          <section className="today-section" aria-hidden="true">
            <div className="today-section-heading">
              <span>Latest performance</span>
            </div>
            <div className="today-skeleton today-skeleton--ribbon" />
          </section>
          <div className="today-skeleton today-skeleton--metrics" />
          <div className="today-skeleton today-skeleton--action" />
          <section className="today-section" aria-hidden="true">
            <div className="today-section-heading">
              <span>Recent sessions</span>
            </div>
            <div className="today-skeleton today-skeleton--rows" />
          </section>
        </div>
        <aside className="today-inspector today-inspector--loading" aria-hidden="true">
          <div className="today-skeleton today-skeleton--inspector" />
        </aside>
      </div>
      <span className="bs-visually-hidden" role="status">{announcement}</span>
    </div>
  )
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="today-page">
      <header className="today-header">
        <div className="today-kicker">BowlSense</div>
        <h1>Today</h1>
      </header>
      <section className="today-state" role="alert">
        <div className="today-state__icon" aria-hidden="true">
          <Icon className="today-icon" name="warning" />
        </div>
        <h2>Your activity didn’t load</h2>
        <p>Check your connection and try again. You can still start a new session now.</p>
        <div className="today-state__actions">
          <button type="button" className="today-button today-button--secondary" onClick={onRetry}>
            Try again
          </button>
          <Link to="/sessions/new" className="today-button today-button--primary">
            <Icon className="today-icon" name="start" />
            Start bowling
          </Link>
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [showQuickLog, setShowQuickLog] = useState(false)
  const [quickLogDraft, setQuickLogDraft] = useState<QuickLogDraft>(createQuickLogDraft)
  const [quickLogSaving, setQuickLogSaving] = useState(false)
  const quickLogSaveInFlight = useRef(false)

  const statsQuery = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => fetchJson<Stats>('/api/stats'),
  })
  const weeklyQuery = useQuery<WeeklyStats>({
    queryKey: ['stats/weekly'],
    queryFn: () => fetchJson<WeeklyStats>('/api/stats/weekly'),
  })
  const sessionsQuery = useQuery<Session[]>({
    queryKey: ['sessions', 'recent'],
    queryFn: fetchRecentSessions,
  })
  const recentGamesQuery = useQuery<Game[]>({
    queryKey: ['games-recent'],
    queryFn: async () => {
      const games = await fetchJson<GameResponse[]>('/api/games-recent')
      return games.map(normalizeGame)
    },
  })
  const ballsQuery = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetchJson<Ball[]>('/api/balls'),
  })
  const tonightQuery = useQuery<TonightLeague[]>({
    queryKey: ['dashboard/tonight'],
    queryFn: () => fetchJson<TonightLeague[]>('/api/dashboard/tonight'),
    staleTime: 5 * 60 * 1000,
  })

  const createSessionMutation = useMutation({
    mutationFn: async (payload: { date: string; location: string; lanes: string }) => fetchJson<{ id: number }>('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  })

  const createGameMutation = useMutation({
    mutationFn: async (payload: SavedGame & { sessionId: number }) => fetchJson('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  })

  const sessions = sessionsQuery.data ?? []
  const recentGames = recentGamesQuery.data ?? []
  const tonightLeagues = tonightQuery.data ?? []
  const latestSession = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]
  const latestGame = recentGames[0]
  const recentHigh = recentGames.length > 0 ? Math.max(...recentGames.map((game) => Number(game.score) || 0)) : 0
  const stats = statsQuery.data
  const weekly = weeklyQuery.data
  const averageDelta = weekly?.delta.average ?? null
  const hasGames = (stats?.totalGames ?? 0) > 0

  const isLoading = statsQuery.isLoading || sessionsQuery.isLoading || recentGamesQuery.isLoading
  const hasCriticalError = statsQuery.isError || sessionsQuery.isError || recentGamesQuery.isError
  const hasSupportingError = weeklyQuery.isError || tonightQuery.isError || ballsQuery.isError

  const retryDashboard = () => {
    void Promise.all([
      statsQuery.refetch(),
      weeklyQuery.refetch(),
      sessionsQuery.refetch(),
      recentGamesQuery.refetch(),
      ballsQuery.refetch(),
      tonightQuery.refetch(),
    ])
  }

  const openQuickLog = () => {
    if (quickLogSaveInFlight.current) return
    createSessionMutation.reset()
    createGameMutation.reset()
    setQuickLogDraft(createQuickLogDraft(latestSession?.location ?? ''))
    setShowQuickLog(true)
  }

  const closeQuickLog = useCallback(() => {
    if (!quickLogSaveInFlight.current) setShowQuickLog(false)
  }, [])

  const handleQuickLogSave = async (game: SavedGame) => {
    if (quickLogSaveInFlight.current || createSessionMutation.isPending || createGameMutation.isPending) return
    quickLogSaveInFlight.current = true
    setQuickLogSaving(true)
    try {
      let sessionId = quickLogDraft.sessionId
      if (sessionId === null) {
        sessionId = (await createSessionMutation.mutateAsync({
          date: quickLogDraft.date,
          location: quickLogDraft.location,
          lanes: quickLogDraft.lanes,
        })).id
        setQuickLogDraft((draft) => ({ ...draft, sessionId }))
      }

      await createGameMutation.mutateAsync({ ...game, sessionId })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
        queryClient.invalidateQueries({ queryKey: ['stats/weekly'] }),
        queryClient.invalidateQueries({ queryKey: ['games-recent'] }),
      ])
      setQuickLogDraft((draft) => ({ ...draft, saved: true }))
    } catch {
      // Mutation state drives the inline retry message; keep the scorer promise handled.
    } finally {
      quickLogSaveInFlight.current = false
      setQuickLogSaving(false)
    }
  }

  if (isLoading) return <DashboardLoading />
  if (hasCriticalError) return <DashboardError onRetry={retryDashboard} />

  const relevantLeagues = tonightLeagues.filter((league) => league.inSeason)
  const contextLeague = relevantLeagues[0]

  return (
    <div className="today-page">
      <div className="today-layout">
        <div className="today-primary">
          <header className="today-header">
            <div className="today-kicker">{settings.name ? `For ${settings.name}` : 'BowlSense'}</div>
            <h1>Today</h1>
            {contextLeague ? (
              <Link
                to={`/leagues/${contextLeague.id}`}
                className="today-context today-context--league"
                aria-label={`View ${contextLeague.name}, week ${contextLeague.nextWeekNumber}`}
              >
                <span className="today-context__icon" aria-hidden="true"><Icon className="today-icon" name="league" /></span>
                <span className="today-context__copy">
                  <strong>{contextLeague.name} tonight</strong>
                  <span>
                    {formatDate(contextLeague.todayIso)} · {contextLeague.location ?? 'Center not set'} · Week {contextLeague.nextWeekNumber} · Opponent not set
                  </span>
                </span>
                {relevantLeagues.length > 1 && <span className="today-context__count">+{relevantLeagues.length - 1}</span>}
                <Icon className="today-icon" name="chevron-right" />
              </Link>
            ) : (
              <div className="today-context">
                <span className="today-context__icon" aria-hidden="true"><Icon className="today-icon" name="location" /></span>
                <span className="today-context__copy">
                  <strong>{latestSession?.location || 'Ready when you are'}</strong>
                  <span>{latestSession ? `Last bowled ${formatDate(latestSession.date)}` : 'Your first frame starts here'}</span>
                </span>
              </div>
            )}
          </header>

          {hasSupportingError && (
            <div className="today-inline-error" role="status">
              Some context is unavailable. Your sessions are still up to date.
              <button type="button" onClick={retryDashboard}>Refresh</button>
            </div>
          )}

          {hasGames ? (
            <>
              <section className="today-section" aria-labelledby="latest-performance-heading">
                <div className="today-section-heading">
                  <h2 id="latest-performance-heading">Latest performance</h2>
                  {latestSession && <Link to={`/sessions/${latestSession.id}`}>Open session</Link>}
                </div>
                <TodayFrameRibbon
                  frames={gameFrameData(latestGame)}
                  score={latestGame?.score ?? latestSession?.highScore ?? 0}
                  gameNumber={latestGame?.gameNumber}
                  location={latestGame?.location ?? latestSession?.location ?? undefined}
                />
              </section>

              <section className="today-metrics" aria-label="Current form">
                <div className="today-metric today-metric--primary">
                  <span className="today-metric__label">Average</span>
                  <div className="today-metric__value-row">
                    <strong>{stats?.average ?? '—'}</strong>
                    {averageDelta !== null && (
                      <span className={`today-delta ${averageDelta > 0 ? 'today-delta--up' : averageDelta < 0 ? 'today-delta--down' : ''}`}>
                        {averageDelta !== 0 && (
                          <Icon
                            className={`today-icon today-icon--${averageDelta > 0 ? 'trendUp' : 'trendDown'}`}
                            name="back"
                          />
                        )}
                        {averageDelta === 0 ? 'No change' : `${averageDelta > 0 ? 'Up' : 'Down'} ${Math.abs(averageDelta)} vs last week`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="today-metric">
                  <span className="today-metric__label">Strike rate</span>
                  <strong>{stats?.strikeRate == null ? '—' : `${stats.strikeRate}%`}</strong>
                </div>
                <div className="today-metric">
                  <span className="today-metric__label">Spare rate</span>
                  <strong>{stats?.spareRate == null ? '—' : `${stats.spareRate}%`}</strong>
                </div>
              </section>

              <details className="today-details">
                <summary>More stats</summary>
                <dl>
                  <div><dt>Total games</dt><dd>{stats?.totalGames ?? 0}</dd></div>
                  <div><dt>This week</dt><dd>{weekly?.thisWeek.games ?? 0} games</dd></div>
                  <div><dt>Weekly high</dt><dd>{weekly?.thisWeek.highGame || '—'}</dd></div>
                </dl>
              </details>

              <TodayActions onQuickLog={openQuickLog} />
            </>
          ) : (
            <section className="today-state today-state--empty">
              <div className="today-state__lane" aria-hidden="true"><span /><span /><span /></div>
              <h2>Set your starting line</h2>
              <p>Record one game to see your frame ribbon, average, and next useful adjustment.</p>
              <TodayActions onQuickLog={openQuickLog} />
            </section>
          )}

          <section className="today-section" aria-labelledby="recent-sessions-heading">
            <div className="today-section-heading">
              <h2 id="recent-sessions-heading">Recent sessions</h2>
              {sessions.length > 0 && <Link to="/sessions">See all</Link>}
            </div>
            <RecentSessions sessions={sessions} />
          </section>
        </div>

        <aside className="today-inspector" aria-label="Tonight and recent context">
          {contextLeague ? (
            <section className="today-inspector__section">
              <span className="today-inspector__eyebrow">Tonight</span>
              <h2>{contextLeague.name}</h2>
              <dl>
                <div><dt>Center</dt><dd>{contextLeague.location ?? 'Not set'}</dd></div>
                <div><dt>Start</dt><dd>Tonight · {formatDate(contextLeague.todayIso)}</dd></div>
                <div><dt>Week</dt><dd>{contextLeague.nextWeekNumber}</dd></div>
                <div><dt>Opponent</dt><dd>Not set</dd></div>
                {contextLeague.lastOpponent && <div><dt>Last faced</dt><dd>{contextLeague.lastOpponent}</dd></div>}
              </dl>
              <Link
                to={`/leagues/${contextLeague.id}?logWeek=1&date=${contextLeague.todayIso}`}
                className="today-button today-button--secondary"
              >
                Log league week
              </Link>
            </section>
          ) : (
            <section className="today-inspector__section">
              <span className="today-inspector__eyebrow">Next time</span>
              <h2>{latestSession?.location || 'Choose a center'}</h2>
              <p>{latestSession ? 'Your most recent center is ready as the starting point for a past-game log.' : 'Add the center when you start your first session.'}</p>
              <button type="button" className="today-button today-button--secondary" onClick={openQuickLog}>Log a past game</button>
            </section>
          )}
          {hasGames && (
            <section className="today-inspector__section today-inspector__section--compact">
              <span className="today-inspector__eyebrow">Recent high</span>
              <strong className="today-inspector__score">{recentHigh || '—'}</strong>
              <span>Across your latest {recentGames.length} game{recentGames.length === 1 ? '' : 's'}</span>
            </section>
          )}
        </aside>
      </div>

      <QuickLogSheet
        open={showQuickLog}
        draft={quickLogDraft}
        status={{
          saving: quickLogSaving,
          error: createSessionMutation.isError || createGameMutation.isError,
        }}
        balls={ballsQuery.data ?? []}
        defaultBallId={settings.defaultBallId}
        onDraftChange={(change) => setQuickLogDraft((draft) => ({ ...draft, ...change }))}
        onSave={handleQuickLogSave}
        onClose={closeQuickLog}
        onLogAnother={() => {
          if (quickLogSaveInFlight.current) return
          createSessionMutation.reset()
          createGameMutation.reset()
          setQuickLogDraft((draft) => ({
            ...draft,
            gameNumber: draft.gameNumber + 1,
            saved: false,
          }))
        }}
      />
    </div>
  )
}
