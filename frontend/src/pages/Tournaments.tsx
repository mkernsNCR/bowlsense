import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import BowlingScorer from '../components/BowlingScorer'
import {
  copyTournamentShareLink,
  downloadTournamentCard,
  getTournamentShareUrl,
  nativeShareTournament,
} from '../utils/tournamentShare'

interface Ball { id: number; name: string }
interface TournamentGame {
  id: number
  tournamentId: number
  gameNumber: number
  score: number | null
  strikes: number | null
  spares: number | null
  splits: number | null
  ballId: number | null
  squad: string | null
  frameData?: string | null
}
interface TournamentStats {
  totalGames: number
  series: number
  average: number
  high: number
  placement: number | null
}
interface Tournament {
  id: number
  name: string
  location: string | null
  date: string
  endDate: string | null
  format: string | null
  entryFee: number | null
  prizeFund: number | null
  placement: number | null
  notes: string | null
  createdAt?: number
  totalGames?: number
  series?: number
  games?: TournamentGame[]
  stats?: TournamentStats
}

interface TournamentBracketBlock {
  label: string
  games: {
    gameNumber: number
    score: number
    ballId: number | null
    ballName: string | null
  }[]
}

interface TournamentBracketStanding {
  rank: number
  ballId: number | null
  ballName: string
  games: number
  total: number
  average: number
}

interface TournamentBracket {
  blocks: TournamentBracketBlock[]
  standings: TournamentBracketStanding[]
}

function frameMarks(frameData?: string | null): string | null {
  if (!frameData) return null
  try {
    const parsed = JSON.parse(frameData) as any
    const frames = Array.isArray(parsed?.frames) ? parsed.frames : []
    return frames.map((f: any, idx: number) => {
      const b1 = f?.ball1, b2 = f?.ball2, b3 = f?.ball3
      const strike = b1 === 10
      const spare = !strike && b1 != null && b2 != null && b1 + b2 === 10
      const mark = (v: number | null | undefined) => v == null ? '' : v === 10 ? 'X' : v === 0 ? '-' : String(v)
      if (idx < 9) {
        if (strike) return 'X'
        if (b1 == null) return ''
        if (b2 == null) return mark(b1)
        return `${mark(b1)}${spare ? '/' : mark(b2)}`
      }
      const second = b2 != null ? (b1 !== 10 && b1! + b2 === 10 ? '/' : mark(b2)) : ''
      const third = b3 != null ? (b1 === 10 && b2 != null && b2 < 10 && b2 + b3 === 10 ? '/' : mark(b3)) : ''
      return `${mark(b1)}${second}${third}`
    }).filter(Boolean).join(' ')
  } catch {
    return null
  }
}

const emptyForm = {
  name: '',
  location: '',
  date: new Date().toISOString().slice(0, 10),
  endDate: '',
  format: '',
  entryFee: '',
  prizeFund: '',
  placement: '',
  notes: '',
}

export default function TournamentsPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  if (id) {
    const isEdit = window.location.pathname.endsWith('/edit')
    return <TournamentDetail id={id} isEditing={isEdit} onEdit={() => navigate(`/tournaments/${id}/edit`)} />
  }

  if (window.location.pathname === '/tournaments/new') {
    return <TournamentForm title="New Tournament" submitText="Create Tournament" onSubmitDone={(newId) => navigate(`/tournaments/${newId}`)} />
  }

  return <TournamentList />
}

function TournamentList() {
  const { data: tournaments, isLoading } = useQuery<Tournament[]>({
    queryKey: ['tournaments'],
    queryFn: () => fetch('/api/tournaments').then((r) => r.json()),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        <h1>Tournaments</h1>
        <Link to="/tournaments/new" className="btn btn-primary">+ New Tournament</Link>
      </div>

      {isLoading && <div className="muted">Loading tournaments...</div>}

      {!isLoading && !tournaments?.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">No tournaments yet.</div>
          <Link to="/tournaments/new" style={{ color: 'var(--accent)' }}>Create your first tournament →</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tournaments?.map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className="card card-accent-top" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, fontSize: 18 }}>{t.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>{[t.date, t.location, t.format].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ fontSize: 20 }}>{placementBadge(t.placement)}</div>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MiniPill label="Games" value={t.totalGames ?? 0} />
              <MiniPill label="Series" value={t.series ?? 0} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function TournamentForm({ title, submitText, initial, tournamentId, onSubmitDone }: { title: string; submitText: string; initial?: typeof emptyForm; tournamentId?: string; onSubmitDone: (id: number) => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(initial || emptyForm)

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        entryFee: form.entryFee === '' ? null : Number(form.entryFee),
        prizeFund: form.prizeFund === '' ? null : Number(form.prizeFund),
        placement: form.placement === '' ? null : Number(form.placement),
      }
      const url = tournamentId ? `/api/tournaments/${tournamentId}` : '/api/tournaments'
      const method = tournamentId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save tournament')
      return res.json()
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      if (tournamentId) qc.invalidateQueries({ queryKey: ['tournament', tournamentId] })
      onSubmitDone(saved.id)
    },
  })

  return (
    <div>
      <h1 style={{ marginBottom: 14 }}>{title}</h1>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <input placeholder="Tournament Name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input placeholder="Location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <label className="muted" style={{ fontSize: 12 }}>Date *</label>
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        <label className="muted" style={{ fontSize: 12 }}>End Date (optional)</label>
        <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        <input placeholder="Format (Singles, Doubles, Team...)" value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))} />
        <input type="number" step="0.01" placeholder="Entry Fee ($)" value={form.entryFee} onChange={(e) => setForm((f) => ({ ...f, entryFee: e.target.value }))} />
        <input type="number" step="0.01" placeholder="Prize Fund ($)" value={form.prizeFund} onChange={(e) => setForm((f) => ({ ...f, prizeFund: e.target.value }))} />
        <input type="number" min={1} placeholder="Placement" value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))} />
        <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />

        <button className="btn btn-primary" disabled={mutation.isPending || !form.name.trim() || !form.date} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving...' : submitText}
        </button>
      </div>
    </div>
  )
}

function TournamentDetail({ id, isEditing, onEdit }: { id: string; isEditing: boolean; onEdit: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: tournament, isLoading } = useQuery<Tournament>({
    queryKey: ['tournament', id],
    queryFn: () => fetch(`/api/tournaments/${id}`).then((r) => r.json()),
  })
  const { data: balls } = useQuery<Ball[]>({
    queryKey: ['balls'],
    queryFn: () => fetch('/api/balls').then((r) => r.json()),
  })

  const [rescoringGameId, setRescoringGameId] = useState<number | null>(null)

  const updateGame = useMutation({
    mutationFn: ({ gameId, data }: { gameId: number; data: object }) =>
      fetch(`/api/tournaments/games/${gameId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] })
      qc.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })

  const deleteTournament = useMutation({
    mutationFn: () => fetch(`/api/tournaments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      navigate('/tournaments')
    },
  })

  const addGame = useMutation({
    mutationFn: (payload: object) => fetch(`/api/tournaments/${id}/games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] })
      qc.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })

  const deleteGame = useMutation({
    mutationFn: (gameId: number) => fetch(`/api/tournaments/games/${gameId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament', id] })
      qc.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })

  const nextGameNumber = useMemo(() => (tournament?.games?.length || 0) + 1, [tournament?.games?.length])
  const [showScorer, setShowScorer] = useState(false)
  const [squad, setSquad] = useState('')
  const [view, setView] = useState<'games' | 'standings'>('games')
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [sharing, setSharing] = useState(false)

  const { data: bracket, isLoading: isBracketLoading } = useQuery<TournamentBracket>({
    queryKey: ['tournament-bracket', id],
    queryFn: () => fetch(`/api/tournaments/${id}/bracket`).then((r) => r.json()),
    enabled: view === 'standings',
  })

  if (isLoading) return <div className="muted">Loading tournament...</div>
  if (!tournament) return <div className="muted">Tournament not found.</div>

  if (isEditing) {
    return (
      <TournamentForm
        title="Edit Tournament"
        submitText="Save Changes"
        tournamentId={id}
        initial={{
          name: tournament.name || '',
          location: tournament.location || '',
          date: tournament.date || '',
          endDate: tournament.endDate || '',
          format: tournament.format || '',
          entryFee: tournament.entryFee?.toString() || '',
          prizeFund: tournament.prizeFund?.toString() || '',
          placement: tournament.placement?.toString() || '',
          notes: tournament.notes || '',
        }}
        onSubmitDone={(savedId) => navigate(`/tournaments/${savedId}`)}
      />
    )
  }

  const net = tournament.entryFee != null && tournament.prizeFund != null ? tournament.prizeFund - tournament.entryFee : null

  const handleShare = async () => {
    setSharing(true)
    const ok = await nativeShareTournament({
      tournamentId: Number(id),
      filename: `bowlsense-tournament-${id}.png`,
      title: tournament.name || 'Tournament',
      text: `Check out my ${tournament.name} results!`,
    })
    setSharing(false)
    if (!ok) {
      await copyTournamentShareLink(Number(id))
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 1800)
    }
    setShareMenuOpen(false)
  }

  const handleCopyLink = async () => {
    await copyTournamentShareLink(Number(id))
    setCopiedLink(true)
    window.setTimeout(() => setCopiedLink(false), 1800)
    setShareMenuOpen(false)
  }

  const handleDownloadCard = async () => {
    await downloadTournamentCard(Number(id), `bowlsense-tournament-${id}.png`)
    setShareMenuOpen(false)
  }

  const handleXShare = () => {
    const text = `Just finished ${tournament.name} — averaging ${tournament.stats?.average || 0}! 🎯`
    const url = getTournamentShareUrl(Number(id))
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
    setShareMenuOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start', marginBottom: 14 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{tournament.name}</h1>
          <div className="muted" style={{ fontSize: 13 }}>{[tournament.date, tournament.location, tournament.format].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          <button
            className="btn btn-primary"
            onClick={() => setShareMenuOpen((v) => !v)}
            style={{ minHeight: 36, padding: '6px 14px', fontWeight: 700 }}
          >
            {copiedLink ? '✅ Copied!' : sharing ? '⏳ Sharing...' : '📤 Share'}
          </button>
          {shareMenuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                background: '#1a1a2e',
                border: '1px solid rgba(167,139,250,0.3)',
                borderRadius: 12,
                padding: 6,
                zIndex: 200,
                minWidth: 200,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
              onMouseLeave={() => setShareMenuOpen(false)}
            >
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', background: 'none', borderRadius: 8, fontSize: 13, marginBottom: 2 }}
                onClick={handleShare}
              >
                📤 Share Card
              </button>
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', background: 'none', borderRadius: 8, fontSize: 13, marginBottom: 2 }}
                onClick={handleCopyLink}
              >
                🔗 Copy Link
              </button>
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', background: 'none', borderRadius: 8, fontSize: 13, marginBottom: 2 }}
                onClick={handleDownloadCard}
              >
                💾 Download Image
              </button>
              <button
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', background: 'none', borderRadius: 8, fontSize: 13 }}
                onClick={handleXShare}
              >
                𝕏 Share on X
              </button>
            </div>
          )}
          <a href={`/tournaments/${id}/standings`} className="btn btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Standings</a>
          <button className="btn btn-ghost" onClick={onEdit}>Edit</button>
          <button className="btn btn-danger" onClick={() => { if (confirm('Delete this tournament and all games?')) deleteTournament.mutate() }}>Delete</button>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, paddingBottom: 2 }}>
          <StatPill label="Series" value={tournament.stats?.series ?? 0} />
          <StatPill label="Avg" value={tournament.stats?.average ?? 0} />
          <StatPill label="High" value={tournament.stats?.high ?? 0} />
          <StatPill label="Place" value={placementBadge(tournament.stats?.placement ?? tournament.placement)} />
          <StatPill label="Net" value={net == null ? '-' : `${net >= 0 ? '+' : ''}$${net.toFixed(2)}`} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          className={`btn ${view === 'games' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setView('games')}
        >
          Games
        </button>
        <button
          className={`btn ${view === 'standings' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setView('standings')}
        >
          Standings
        </button>
      </div>

      {view === 'games' && (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            {(tournament.games || []).map((g) => {
              const ballName = balls?.find((b) => b.id === g.ballId)?.name
              const marks = frameMarks(g.frameData)
              return (
                <div key={g.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Game {g.gameNumber} {g.squad ? `· ${g.squad}` : ''}</div>
                      <div className="muted" style={{ fontSize: 13 }}>{`Score ${g.score ?? '-'} · ⚡ ${g.strikes ?? 0} · ✅ ${g.spares ?? 0} · 🔀 ${g.splits ?? 0}`}{ballName ? ` · 🎳 ${ballName}` : ''}</div>
                      {marks && <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text)', fontSize: 11, marginTop: 3 }}>{marks}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setRescoringGameId(g.id)}
                      >
                        Edit
                      </button>
                      <button className="btn btn-danger" onClick={() => { if (confirm('Delete this game?')) deleteGame.mutate(g.id) }}>Delete</button>
                    </div>
                  </div>

                  {rescoringGameId === g.id && (
                    <div style={{ marginTop: 10, marginLeft: -12, marginRight: -12 }}>
                      <BowlingScorer
                        gameNumber={g.gameNumber}
                        balls={balls || []}
                        defaultBallId={g.ballId ? String(g.ballId) : undefined}
                        onSave={(result) => {
                          updateGame.mutate({ gameId: g.id, data: { ...result, squad: g.squad } })
                          setRescoringGameId(null)
                        }}
                        onCancel={() => setRescoringGameId(null)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!showScorer ? (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowScorer(true)}>
              🎳 Bowl a Game
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div style={{ padding: '0 4px 8px', display: 'grid', gap: 8 }}>
                <div className="muted" style={{ fontSize: 12 }}>Game {nextGameNumber}</div>
                <input
                  placeholder="Squad / Block label (optional)"
                  value={squad}
                  onChange={(e) => setSquad(e.target.value)}
                />
              </div>
              <BowlingScorer
                gameNumber={nextGameNumber}
                balls={balls || []}
                defaultBallId={undefined}
                onSave={(game) => addGame.mutate({ ...game, squad }, {
                  onSuccess: () => {
                    setSquad('')
                    setShowScorer(false)
                  },
                })}
                onCancel={() => setShowScorer(false)}
              />
            </div>
          )}
        </>
      )}

      {view === 'standings' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {isBracketLoading && <div className="muted">Loading standings...</div>}

          {!isBracketLoading && (bracket?.standings?.length || 0) === 0 && (
            <div className="card muted">No games yet</div>
          )}

          {!isBracketLoading && (bracket?.standings?.length || 0) > 0 && (
            <>
              {(bracket?.blocks || []).map((block, idx) => (
                <div className="card" key={`${block.label}-${idx}`}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{block.label}</div>
                  <div style={{ width: '100%', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Game</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.games.map((game, gameIdx) => (
                          <tr key={`${block.label}-${game.gameNumber}-${gameIdx}`}>
                            <td style={{ padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>Game {game.gameNumber}</td>
                            <td style={{ padding: '7px 4px', borderBottom: '1px solid var(--border)' }}>{game.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div className="card">
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Standings</div>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Rank</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Ball</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Games</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Total</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px 4px', color: 'var(--muted)', fontSize: 12 }}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bracket?.standings || []).map((standing) => {
                        const rankColor = standing.rank === 1
                          ? 'color-mix(in srgb, var(--accent) 100%, #f7d774 0%)'
                          : standing.rank === 2
                            ? 'color-mix(in srgb, var(--accent) 68%, #cfd4dd 32%)'
                            : standing.rank === 3
                              ? 'color-mix(in srgb, var(--accent) 56%, #cd7f32 44%)'
                              : 'var(--text)'

                        return (
                          <tr key={`${standing.ballId ?? 'unknown'}-${standing.rank}`}>
                            <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)', color: rankColor, fontWeight: 700 }}>
                              #{standing.rank}
                            </td>
                            <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>{standing.ballName}</td>
                            <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>{standing.games}</td>
                            <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>{standing.total}</td>
                            <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>{standing.average.toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function placementBadge(placement?: number | null) {
  if (!placement) return '—'
  if (placement === 1) return '🥇'
  if (placement === 2) return '🥈'
  if (placement === 3) return '🥉'
  return `#${placement}`
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
