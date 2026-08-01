import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompetitionArchiveSheet } from '../features/competition/CompetitionUI'
import LeaguesPage from './Leagues'
import TournamentsPage from './Tournaments'

const scorerMock = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
vi.mock('../components/BowlingScorer', () => ({
  default: (props: Record<string, unknown>) => {
    scorerMock.props = props
    return <div>Scorer</div>
  },
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  scorerMock.props = null
  window.history.replaceState({}, '', '/')
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(path: string, kind: 'leagues' | 'tournaments') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={`/${kind}`} element={kind === 'leagues' ? <LeaguesPage /> : <TournamentsPage />} />
          <Route path={`/${kind}/:id`} element={kind === 'leagues' ? <LeaguesPage /> : <TournamentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PR 15 competition archive and ordering', () => {
  it('opens the tournament create sheet before treating new as a tournament id', () => {
    renderPage('/tournaments/new', 'tournaments')
    expect(screen.getByRole('dialog', { name: 'New tournament' })).toBeTruthy()
    expect(screen.queryByText('Scorer')).toBeNull()
  })

  it('clears a stale archive mutation error whenever the sheet opens', async () => {
    const reset = vi.fn()
    render(
      <MemoryRouter>
        <CompetitionArchiveSheet
          area="leagues"
          id="7"
          active={1}
          onClose={() => undefined}
          mutation={{ isPending: false, isError: true, mutate: vi.fn(), reset }}
        />
      </MemoryRouter>,
    )
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1))
  })

  it('separates archived leagues while keeping their recovery links available', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { id: 1, name: 'Tuesday Classic', active: 1, gamesPerWeek: 3 },
      { id: 2, name: 'Retired Scratch', active: 0, gamesPerWeek: 3 },
    ]))))

    renderPage('/leagues', 'leagues')

    expect((await screen.findByRole('link', { name: /Tuesday Classic/ })).getAttribute('href')).toBe('/leagues/1')
    const archived = screen.getByRole('heading', { name: 'Archived leagues' }).closest('section')!
    expect(within(archived).getByRole('link', { name: /Retired Scratch/ }).getAttribute('href')).toBe('/leagues/2')
    expect(fetch).toHaveBeenCalledWith('/api/leagues?includeArchived=1')
  })

  it('orders upcoming tournaments nearest-first and separates past and archived events', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse([
      { id: 1, name: 'Far Future Open', date: '2099-10-01', endDate: null, active: 1 },
      { id: 2, name: 'Near Future Open', date: '2099-02-01', endDate: null, active: 1 },
      { id: 3, name: 'Recent Past Open', date: '2001-01-01', endDate: null, active: 1 },
      { id: 4, name: 'Archived Open', date: '2099-01-01', endDate: null, active: 0 },
      { id: 5, name: 'Undated Open', date: null, endDate: null, active: 1 },
    ]))))

    renderPage('/tournaments', 'tournaments')

    const upcoming = (await screen.findByRole('heading', { name: 'Upcoming tournaments' })).closest('section')!
    expect(within(upcoming).getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('Near Future Open'),
      expect.stringContaining('Far Future Open'),
    ])
    const past = within(screen.getByRole('heading', { name: 'Past tournaments' }).closest('section')!)
    expect(past.getByText('Recent Past Open')).toBeTruthy()
    expect(past.getByText('Undated Open')).toBeTruthy()
    expect(within(screen.getByRole('heading', { name: 'Archived tournaments' }).closest('section')!).getByText('Archived Open')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/tournaments?includeArchived=1')
  })

  it('renders a league-list error instead of an empty state for a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ error: 'Unavailable' }, 503))))
    renderPage('/leagues', 'leagues')
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load leagues right now.')
    expect(screen.queryByText('No active leagues.')).toBeNull()
  })

  it('renders a tournament-list error instead of an empty state for a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ error: 'Unavailable' }, 503))))
    renderPage('/tournaments', 'tournaments')
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load tournaments right now.')
    expect(screen.queryByText('No active tournaments.')).toBeNull()
  })

  it('archives a league without issuing a destructive request', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([]))
      if (path === '/api/leagues/7/archive' && init?.method === 'POST') return Promise.resolve(jsonResponse({ id: 7, active: 0 }))
      return Promise.resolve(jsonResponse({
        id: 7, name: 'Safe History League', location: null, season: null, dayOfWeek: null,
        gamesPerWeek: 3, startDate: null, endDate: null, notes: null, active: 1, weeks: [],
        stats: { average: 0, gamesWon: 0, gamesLost: 0, totalWeeks: 0, high: 0 },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderPage('/leagues/7', 'leagues')
    await user.click((await screen.findAllByRole('button', { name: 'Archive league' }))[0]!)
    const sheet = screen.getByRole('dialog', { name: 'Archive league?' })
    await user.click(within(sheet).getByRole('button', { name: 'Archive league' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/leagues/7/archive', { method: 'POST' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('restores an archived tournament and keeps its results recoverable', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([]))
      if (path === '/api/tournaments/9/unarchive' && init?.method === 'POST') return Promise.resolve(jsonResponse({ id: 9, active: 1 }))
      return Promise.resolve(jsonResponse({
        id: 9, name: 'Archived Masters', location: null, date: '2020-01-01', endDate: null,
        format: null, entryFee: null, prizeFund: null, placement: null, notes: null,
        active: 0, games: [{ id: 91, tournamentId: 9, gameNumber: 1, score: 201 }],
        stats: { totalGames: 1, series: 201, average: 201, high: 201, placement: null },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderPage('/tournaments/9', 'tournaments')
    expect(await screen.findByText(/Score 201/)).toBeTruthy()
    await user.click((await screen.findAllByRole('button', { name: 'Restore tournament' }))[0]!)
    const sheet = screen.getByRole('dialog', { name: 'Restore tournament?' })
    await user.click(within(sheet).getByRole('button', { name: 'Restore tournament' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/tournaments/9/unarchive', { method: 'POST' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
  })

  it('restores saved frame data and split count when editing a tournament game', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/balls') return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse({
        id: 4, name: 'Edit Open', location: null, date: '2026-01-01', endDate: null,
        format: null, entryFee: null, prizeFund: null, placement: null, notes: null,
        active: 1, games: [{ id: 41, tournamentId: 4, gameNumber: 1, score: 210, strikes: 6, spares: 4, splits: 2, ballId: null, squad: null, frameData: '{"frames":[]}' }],
        stats: { totalGames: 1, series: 210, average: 210, high: 210, placement: null },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderPage('/tournaments/4', 'tournaments')
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    await user.click(editButtons.at(-1)!)

    expect(scorerMock.props?.initialFrameData).toBe('{"frames":[]}')
    expect(scorerMock.props?.initialSplits).toBe(2)
  })
})
