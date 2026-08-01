import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import BowlingScorer from '../components/BowlingScorer'
import { Icon } from '../design'
import { CompetitionHeader, CompetitionSheet } from '../features/competition/CompetitionUI'
import { formatFrameMarks } from '../features/scoring/frameMarks'

interface Ball { id: number; name: string }
interface LeagueGame {
  id: number
  weekId: number
  gameNumber: number
  score: number | null
  strikes: number | null
  spares: number | null
  splits: number | null
  ballId: number | null
  frameData?: string | null
}
interface LeagueWeek {
  id: number
  leagueId: number
  weekNumber: number
  date: string
  opponent: string | null
  gamesWon: number
  gamesLost: number
  notes: string | null
  games?: LeagueGame[]
}
interface LeagueStats {
  average: number
  high: number
  low: number
  totalPins: number
  totalGames: number
  gamesWon: number
  gamesLost: number
  totalWeeks: number
}
interface League {
  id: number
  name: string
  location: string | null
  season: string | null
  dayOfWeek: string | null
  gamesPerWeek: number
  startDate: string | null
  endDate: string | null
  notes: string | null
  active: number
  weekCount?: number
  gamesWon?: number
  gamesLost?: number
  weeks?: LeagueWeek[]
  stats?: LeagueStats
}

interface WeekGameScore {
  gameNumber: number
  score: number | null
  strikes: number | null
  spares: number | null
  splits: number | null
  ballId: number | null
  frameData?: string | null
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function LeaguesPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  if (id) return <LeagueDetail id={id} />

  const isCreate = window.location.pathname === '/leagues/new'
  if (isCreate) {
    return (
      <>
        <CompetitionHeader area="leagues" title="Leagues" detail="Your weekly competition, in one place." />
        <CompetitionSheet title="New league" closeTo="/leagues">
          <LeagueCreate onDone={(newId) => navigate(`/leagues/${newId}`)} />
        </CompetitionSheet>
      </>
    )
  }
  return <LeagueList />
}

function LeagueList() {
  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => fetch('/api/leagues?includeArchived=1').then((r) => r.json()),
  })
  const activeLeagues = leagues?.filter((league) => league.active !== 0) || []
  const archivedLeagues = leagues?.filter((league) => league.active === 0) || []

  return (
    <div>
      <CompetitionHeader
        area="leagues"
        title="Leagues"
        detail="Your weekly competition, in one place."
        action={<Link to="/leagues/new" className="btn btn-primary"><Icon className="competition-action-icon" name="plus" /> New league</Link>}
      />

      {isLoading && <div className="muted">Loading leagues...</div>}

      {!isLoading && !activeLeagues.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">No active leagues.</div>
          <Link to="/leagues/new" style={{ color: 'var(--accent)' }}>Create a league</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {activeLeagues.map((league) => <LeagueListCard key={league.id} league={league} />)}
      </div>

      {!!archivedLeagues.length && (
        <section aria-labelledby="archived-leagues-heading" style={{ marginTop: 24 }}>
          <h2 id="archived-leagues-heading" style={{ fontSize: 16, marginBottom: 10 }}>Archived leagues</h2>
          <p className="muted" style={{ fontSize: 13 }}>History is preserved. Open a league to restore it.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {archivedLeagues.map((league) => <LeagueListCard key={league.id} league={league} archived />)}
          </div>
        </section>
      )}
    </div>
  )
}

function LeagueListCard({ league, archived = false }: { league: League; archived?: boolean }) {
  return (
    <Link to={`/leagues/${league.id}`} className="card card-accent-top" style={{ textDecoration: 'none', color: 'inherit', opacity: archived ? 0.78 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: 18 }}>{league.name}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {[league.location, league.season, league.dayOfWeek].filter(Boolean).join(' · ') || 'League'}
          </div>
        </div>
        <span style={{ color: 'var(--accent)', fontSize: 14 }}>{archived ? 'Archived' : 'View'}</span>
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <MiniPill label="Weeks" value={league.weekCount ?? 0} />
        <MiniPill label="W-L" value={`${league.gamesWon ?? 0}-${league.gamesLost ?? 0}`} />
      </div>
    </Link>
  )
}

function LeagueCreate({ onDone }: { onDone: (id: number) => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', location: '', season: '', dayOfWeek: '', gamesPerWeek: '3', startDate: '', endDate: '', notes: '' })

  const createLeague = useMutation({
    mutationFn: (payload: object) => fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
    onSuccess: (newLeague) => {
      qc.invalidateQueries({ queryKey: ['leagues'] })
      onDone(newLeague.id)
    },
  })

  return (
    <div>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <label>League name<input autoFocus required placeholder="Thursday Classic" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
        <label>Location<input placeholder="Center or city" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></label>
        <label>Season<input placeholder="2026 Spring" value={form.season} onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))} /></label>
        <label>Day of week
        <select value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}>
          <option value="">Day of Week</option>
          {days.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        </label>
        <label>Games per week<input type="number" min={1} value={form.gamesPerWeek} onChange={(e) => setForm((f) => ({ ...f, gamesPerWeek: e.target.value }))} /></label>
        <label>Start date<input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></label>
        <label>End date<input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></label>
        <label>Notes<textarea placeholder="Optional, private to your account" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></label>
        <button
          className="btn btn-primary"
          disabled={!form.name.trim() || createLeague.isPending}
          onClick={() => createLeague.mutate({
            name: form.name,
            location: form.location,
            season: form.season,
            dayOfWeek: form.dayOfWeek,
            gamesPerWeek: Number(form.gamesPerWeek || 3),
            startDate: form.startDate,
            endDate: form.endDate,
            notes: form.notes,
          })}
        >
          {createLeague.isPending ? 'Creating…' : 'Create league'}
        </button>
      </div>
    </div>
  )
}

function LeagueDetail({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([])
  // Auto-open the LogWeekForm when arriving from the Dashboard's "Log This Week" button
  const [showLogWeek, setShowLogWeek] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('logWeek') === '1'
  })
  const [editingWeekId, setEditingWeekId] = useState<number | null>(null)
  const [rescoringGameId, setRescoringGameId] = useState<number | null>(null)
  const [editingLeague, setEditingLeague] = useState(false)
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false)
  const [leagueForm, setLeagueForm] = useState({ name: '', location: '', season: '', dayOfWeek: '', gamesPerWeek: '', startDate: '', endDate: '', notes: '' })
  const [weekForm, setWeekForm] = useState({ date: '', opponent: '', gamesWon: '', gamesLost: '', notes: '' })

  const { data: league, isLoading } = useQuery<League>({
    queryKey: ['league', id],
    queryFn: () => fetch(`/api/leagues/${id}`).then((r) => r.json()),
  })

  const { data: balls } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then((r) => r.json()),
  })

  const updateWeek = useMutation({
    mutationFn: ({ weekId, data }: { weekId: number; data: object }) =>
      fetch(`/api/leagues/weeks/${weekId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      setEditingWeekId(null)
      qc.invalidateQueries({ queryKey: ['league', id] })
      qc.invalidateQueries({ queryKey: ['leagues'] })
    },
  })

  const updateGame = useMutation({
    mutationFn: ({ gameId, data }: { gameId: number; data: object }) =>
      fetch(`/api/leagues/games/${gameId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      setRescoringGameId(null)
      qc.invalidateQueries({ queryKey: ['league', id] })
      qc.invalidateQueries({ queryKey: ['leagues'] })
    },
  })

  const deleteWeek = useMutation({
    mutationFn: (weekId: number) => fetch(`/api/leagues/weeks/${weekId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', id] })
      qc.invalidateQueries({ queryKey: ['leagues'] })
    },
  })

  const setArchiveState = useMutation({
    mutationFn: async (restore: boolean) => {
      const response = await fetch(`/api/leagues/${id}/${restore ? 'unarchive' : 'archive'}`, { method: 'POST' })
      if (!response.ok) throw new Error(`Unable to ${restore ? 'restore' : 'archive'} league`)
      return response.json()
    },
    onSuccess: () => {
      setArchiveSheetOpen(false)
      qc.invalidateQueries({ queryKey: ['league', id] })
      qc.invalidateQueries({ queryKey: ['leagues'] })
    },
  })

  const updateLeague = useMutation({
    mutationFn: (data: object) => fetch(`/api/leagues/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', id] })
      qc.invalidateQueries({ queryKey: ['leagues'] })
      setEditingLeague(false)
    },
  })

  const nextWeekNumber = useMemo(() => ((league?.weeks?.length || 0) + 1), [league?.weeks?.length])

  if (isLoading) return <div className="muted">Loading league...</div>
  if (!league) return <div className="muted">League not found.</div>

  return (
    <div>
      <CompetitionHeader
        area="leagues"
        title={league.name}
        detail={[league.location, league.season, league.dayOfWeek].filter(Boolean).join(' · ') || 'League competition'}
        action={league.active === 0
          ? <button className="btn btn-primary" onClick={() => setArchiveSheetOpen(true)}>Restore league</button>
          : <button className="btn btn-primary" onClick={() => setShowLogWeek(true)}><Icon className="competition-action-icon" name="plus" /> Log this week</button>}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            className="btn btn-ghost"
            style={{ minHeight: 44, padding: '6px 12px', fontSize: 13, borderColor: 'rgba(167,139,250,0.4)', color: '#c4b5fd' }}
            onClick={() => navigate(`/leagues/${league.id}/leaderboard`)}
          >
            Leaderboard
          </button>

          <button
            className="btn btn-primary"
            style={{ minHeight: 44, padding: '6px 12px', fontSize: 13 }}
            onClick={() => navigate(`/leagues/${league.id}/share`)}
          >
            <Icon className="competition-action-icon" name="share" /> Share league
          </button>

          <button
            className="btn btn-ghost"
            style={{ minHeight: 44, padding: '6px 12px', fontSize: 13, borderColor: 'rgba(251,191,36,0.4)' }}
            onClick={() => navigate(`/leagues/${league.id}/recap`)}
          >
            Share recap
          </button>

          <button className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 12px', fontSize: 13 }} onClick={() => {
            setLeagueForm({
              name: league.name || '',
              location: league.location || '',
              season: league.season || '',
              dayOfWeek: league.dayOfWeek || '',
              gamesPerWeek: String(league.gamesPerWeek || 3),
              startDate: league.startDate || '',
              endDate: league.endDate || '',
              notes: league.notes || '',
            })
            setEditingLeague(true)
          }}><Icon className="competition-action-icon" name="edit" /> Edit</button>
          {league.active !== 0 && (
            <button className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 12px', fontSize: 13 }} onClick={() => setArchiveSheetOpen(true)}>
              Archive league
            </button>
          )}
      </div>

      {archiveSheetOpen && (
        <CompetitionSheet
          title={league.active === 0 ? 'Restore league?' : 'Archive league?'}
          closeTo={`/leagues/${id}`}
          onClose={() => setArchiveSheetOpen(false)}
        >
          <div className="card" style={{ display: 'grid', gap: 14 }}>
            <p style={{ margin: 0 }}>
              {league.active === 0
                ? 'This league will return to your active leagues. All weeks and games are already preserved.'
                : 'This league will move out of your active list. All weeks and games will be preserved, and you can restore it later.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className={league.active === 0 ? 'btn btn-primary' : 'btn btn-danger'}
                disabled={setArchiveState.isPending}
                onClick={() => setArchiveState.mutate(league.active === 0)}
              >
                {setArchiveState.isPending ? 'Saving…' : league.active === 0 ? 'Restore league' : 'Archive league'}
              </button>
              <button className="btn btn-ghost" onClick={() => setArchiveSheetOpen(false)}>Cancel</button>
            </div>
            {setArchiveState.isError && <div role="alert" style={{ color: 'var(--danger)' }}>Could not update this league. Please try again.</div>}
          </div>
        </CompetitionSheet>
      )}

      {editingLeague && (
        <CompetitionSheet title="Edit league" closeTo={`/leagues/${id}`} onClose={() => setEditingLeague(false)}>
        <div className="card">
          <div style={{ display: 'grid', gap: 10 }}>
            <label>League name<input autoFocus required value={leagueForm.name} onChange={e => setLeagueForm(f => ({ ...f, name: e.target.value }))} /></label>
            <label>Location<input value={leagueForm.location} onChange={e => setLeagueForm(f => ({ ...f, location: e.target.value }))} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Season<input placeholder="2025–26" value={leagueForm.season} onChange={e => setLeagueForm(f => ({ ...f, season: e.target.value }))} /></label>
              <label>Day<select value={leagueForm.dayOfWeek} onChange={e => setLeagueForm(f => ({ ...f, dayOfWeek: e.target.value }))}>
                <option value="">Day of Week</option>
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
              </select></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>Games per week<input type="number" min={1} value={leagueForm.gamesPerWeek} onChange={e => setLeagueForm(f => ({ ...f, gamesPerWeek: e.target.value }))} /></label>
              <label>Start date<input type="date" value={leagueForm.startDate} onChange={e => setLeagueForm(f => ({ ...f, startDate: e.target.value }))} /></label>
            </div>
            <label>End date<input type="date" value={leagueForm.endDate} onChange={e => setLeagueForm(f => ({ ...f, endDate: e.target.value }))} /></label>
            <label>Notes<textarea value={leagueForm.notes} onChange={e => setLeagueForm(f => ({ ...f, notes: e.target.value }))} /></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ minHeight: 44, padding: '6px 16px' }} onClick={() => updateLeague.mutate({
                name: leagueForm.name,
                location: leagueForm.location,
                season: leagueForm.season,
                dayOfWeek: leagueForm.dayOfWeek,
                gamesPerWeek: Number(leagueForm.gamesPerWeek || 3),
                startDate: leagueForm.startDate,
                endDate: leagueForm.endDate,
                notes: leagueForm.notes,
              })}>
                {updateLeague.isPending ? 'Saving…' : 'Save changes'}
              </button>
              <button className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 16px' }} onClick={() => setEditingLeague(false)}>Cancel</button>
            </div>
          </div>
        </div>
        </CompetitionSheet>
      )}

      <div style={{ width: '100%', overflowX: 'auto', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, paddingBottom: 2 }}>
          <StatPill label="Avg" value={league.stats?.average ?? 0} />
          <StatPill label="W-L" value={`${league.stats?.gamesWon ?? 0}-${league.stats?.gamesLost ?? 0}`} />
          <StatPill label="Weeks" value={league.stats?.totalWeeks ?? 0} />
          <StatPill label="High" value={league.stats?.high ?? 0} />
        </div>
      </div>

      {league.active !== 0 && !showLogWeek && <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={() => setShowLogWeek(true)}><Icon className="competition-action-icon" name="plus" /> Log this week</button>}

      {league.active !== 0 && showLogWeek && (
        <CompetitionSheet title={`Log week ${nextWeekNumber}`} closeTo={`/leagues/${id}`} onClose={() => setShowLogWeek(false)}>
          <LogWeekForm
            leagueId={league.id}
            gamesPerWeek={league.gamesPerWeek || 3}
            nextWeekNumber={nextWeekNumber}
            balls={balls || []}
            location={league.location}
            onSaved={() => {
              setShowLogWeek(false)
              qc.invalidateQueries({ queryKey: ['league', id] })
              qc.invalidateQueries({ queryKey: ['leagues'] })
            }}
          />
        </CompetitionSheet>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {(league.weeks || []).map((week) => {
          const expanded = expandedWeeks.includes(week.id)
          return (
            <div key={week.id} className="card" style={{ padding: 12 }}>
              <button
                style={{ width: '100%', background: 'transparent', border: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => setExpandedWeeks((prev) => prev.includes(week.id) ? prev.filter((w) => w !== week.id) : [...prev, week.id])}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Week {week.weekNumber} · {new Date(week.date).toLocaleDateString()}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {week.opponent ? `vs ${week.opponent} · ` : ''}
                      W/L: {week.gamesWon}-{week.gamesLost}
                    </div>
                  </div>
                  <span style={{ color: 'var(--accent)' }} aria-hidden="true">{expanded ? 'Collapse' : 'Expand'}</span>
                </div>
              </button>

              <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {(week.games || []).map((g) => `G${g.gameNumber}: ${g.score ?? '-'}`).join(', ') || 'No games'}
                {(week.games || []).length > 0 && (() => {
                  const series = (week.games || []).reduce((sum, g) => sum + (g.score || 0), 0)
                  return <span style={{ marginLeft: 10, color: 'var(--accent)', fontWeight: 700 }}>Series: {series}</span>
                })()}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  className="btn btn-ghost"
                  style={{ minHeight: 44, padding: '5px 10px' }}
                  onClick={() => {
                    setEditingWeekId(week.id)
                    setWeekForm({
                      date: week.date || '',
                      opponent: week.opponent || '',
                      gamesWon: String(week.gamesWon ?? 0),
                      gamesLost: String(week.gamesLost ?? 0),
                      notes: week.notes || '',
                    })
                  }}
                >
                  Edit
                </button>
              </div>

              {editingWeekId === week.id && (
                <CompetitionSheet title={`Edit week ${week.weekNumber}`} closeTo={`/leagues/${id}`} onClose={() => setEditingWeekId(null)}>
                <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: '#131326' }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label>Date<input type="date" value={weekForm.date} onChange={(e) => setWeekForm((f) => ({ ...f, date: e.target.value }))} /></label>
                    <label>Opponent<input value={weekForm.opponent} onChange={(e) => setWeekForm((f) => ({ ...f, opponent: e.target.value }))} /></label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label>Games won<input type="number" min={0} value={weekForm.gamesWon} onChange={(e) => setWeekForm((f) => ({ ...f, gamesWon: e.target.value }))} /></label>
                      <label>Games lost<input type="number" min={0} value={weekForm.gamesLost} onChange={(e) => setWeekForm((f) => ({ ...f, gamesLost: e.target.value }))} /></label>
                    </div>
                    <label>Notes<textarea value={weekForm.notes} onChange={(e) => setWeekForm((f) => ({ ...f, notes: e.target.value }))} /></label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ minHeight: 44, padding: '5px 10px' }} onClick={() => updateWeek.mutate({ weekId: week.id, data: { date: weekForm.date, opponent: weekForm.opponent, gamesWon: Number(weekForm.gamesWon || 0), gamesLost: Number(weekForm.gamesLost || 0), notes: weekForm.notes } })}>Save</button>
                      <button className="btn btn-ghost" style={{ minHeight: 44, padding: '5px 10px' }} onClick={() => setEditingWeekId(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
                </CompetitionSheet>
              )}

              {expanded && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(week.games || []).map((g) => {
                      const ballName = balls?.find((b) => b.id === g.ballId)?.name
                      const marks = formatFrameMarks(g.frameData)
                      return (
                        <div key={g.id} style={{ background: '#101022', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                              <div style={{ fontWeight: 650 }}>Game {g.gameNumber}: {g.score ?? '-'}</div>
                              {marks ? (
                                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text)', fontSize: 11, marginTop: 3 }}>{marks}</div>
                              ) : (
                                <div className="muted" style={{ fontSize: 12 }}>⚡ {g.strikes ?? 0} · ✅ {g.spares ?? 0} · 🔀 {g.splits ?? 0}{ballName ? ` · 🎳 ${ballName}` : ''}</div>
                              )}
                              {marks && ballName && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🎳 {ballName}</div>}
                            </div>
                            <button
                              className="btn btn-ghost"
                              style={{ minHeight: 44, padding: '4px 8px' }}
                              onClick={() => setRescoringGameId(g.id)}
                            >
                              Edit
                            </button>
                          </div>

                          {rescoringGameId === g.id && (
                            <CompetitionSheet title={`Edit game ${g.gameNumber}`} closeTo={`/leagues/${id}`} onClose={() => setRescoringGameId(null)}>
                            <div>
                              <BowlingScorer
                                gameNumber={g.gameNumber}
                                balls={balls || []}
                                defaultBallId={g.ballId ? String(g.ballId) : undefined}
                                shareContext={{ location: league.location, date: week.date }}
                                onSave={(result) => updateGame.mutate({ gameId: g.id, data: result })}
                                onCancel={() => setRescoringGameId(null)}
                              />
                            </div>
                            </CompetitionSheet>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <button className="btn btn-danger" style={{ marginTop: 10, width: '100%' }} onClick={() => { if (confirm('Delete this week and all games in it?')) deleteWeek.mutate(week.id) }}>
                    Delete Week
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LogWeekForm({ leagueId, gamesPerWeek, nextWeekNumber, balls, location, onSaved }: { leagueId: number; gamesPerWeek: number; nextWeekNumber: number; balls: Ball[]; location?: string | null; onSaved: () => void }) {
  // Pre-fill date from URL ?date=YYYY-MM-DD if present (set by Dashboard "Log This Week")
  const initialDate = (() => {
    if (typeof window === 'undefined') return new Date().toISOString().slice(0, 10)
    const fromUrl = new URLSearchParams(window.location.search).get('date')
    return fromUrl || new Date().toISOString().slice(0, 10)
  })()

  const [weekNumber, setWeekNumber] = useState(String(nextWeekNumber))
  const [date, setDate] = useState(initialDate)
  const [opponent, setOpponent] = useState('')
  const [gamesWon, setGamesWon] = useState('0')
  const [gamesLost, setGamesLost] = useState('0')
  const [notes, setNotes] = useState('')
  const [weekGames, setWeekGames] = useState<WeekGameScore[]>([])
  const [scoringGame, setScoringGame] = useState<number | null>(null)

  const submitWeek = useMutation({
    mutationFn: async () => {
      const weekRes = await fetch(`/api/leagues/${leagueId}/weeks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekNumber: Number(weekNumber || nextWeekNumber),
          date,
          opponent,
          gamesWon: Number(gamesWon || 0),
          gamesLost: Number(gamesLost || 0),
          notes,
        }),
      })
      const week = await weekRes.json()

      const sortedGames = [...weekGames].sort((a, b) => a.gameNumber - b.gameNumber)
      for (const game of sortedGames) {
        await fetch(`/api/leagues/weeks/${week.id}/games`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(game),
        })
      }
    },
    onSuccess: onSaved,
  })

  const nextGameNumber = weekGames.length + 1
  const allGamesLogged = weekGames.length === gamesPerWeek

  return (
    <div className="card" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
      <label>Week number<input type="number" min={1} value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} /></label>
      <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Opponent<input value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label>

      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 10, background: '#0f0f1c', display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 650 }}>Games ({weekGames.length}/{gamesPerWeek})</div>

        {weekGames.map((game) => {
          const ballName = balls.find((b) => b.id === game.ballId)?.name
          const marks = formatFrameMarks(game.frameData)
          return (
            <div key={game.gameNumber} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: '#101022' }}>
              <div style={{ fontWeight: 650 }}>Game {game.gameNumber}: {game.score ?? '-'}</div>
              {marks ? (
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text)', fontSize: 11, marginTop: 2 }}>{marks}</div>
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>⚡ {game.strikes ?? 0} · ✅ {game.spares ?? 0} · 🔀 {game.splits ?? 0}</div>
              )}
              {ballName && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>🎳 {ballName}</div>}
            </div>
          )
        })}

        {!scoringGame && !allGamesLogged && (
          <button className="btn btn-primary" onClick={() => setScoringGame(nextGameNumber)}>
            Start Game {nextGameNumber}
          </button>
        )}

        {scoringGame !== null && (
          <div style={{ marginLeft: -16, marginRight: -16 }}>
          <BowlingScorer
            gameNumber={scoringGame}
            balls={balls}
            defaultBallId={undefined}
            shareContext={{ location, date }}
            onSave={(game) => {
              setWeekGames((prev) => [...prev.filter((g) => g.gameNumber !== game.gameNumber), game].sort((a, b) => a.gameNumber - b.gameNumber))
              setScoringGame(null)
            }}
            onCancel={() => setScoringGame(null)}
          />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label>Games won<input type="number" min={0} value={gamesWon} onChange={(e) => setGamesWon(e.target.value)} /></label>
        <label>Games lost<input type="number" min={0} value={gamesLost} onChange={(e) => setGamesLost(e.target.value)} /></label>
      </div>
      <label>Notes<textarea placeholder="Optional, private to your account" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

      <button className="btn btn-primary" onClick={() => submitWeek.mutate()} disabled={submitWeek.isPending || !date || !allGamesLogged}>
        {submitWeek.isPending ? 'Saving…' : 'Save week'}
      </button>
      {!allGamesLogged && <div className="muted" style={{ fontSize: 12 }}>Complete all {gamesPerWeek} games to submit this week.</div>}
    </div>
  )
}

function MiniPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid var(--border)', background: '#101023', borderRadius: 999, padding: '6px 10px', fontSize: 12 }}>
      <span className="muted">{label}: </span>
      <strong style={{ color: 'var(--accent)' }}>{value}</strong>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ minWidth: 104, background: '#121228', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 14px', textAlign: 'center' }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
    </div>
  )
}
