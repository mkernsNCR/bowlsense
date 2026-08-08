import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SessionDetail from './SessionDetail'
import Sessions from './Sessions'

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ settings: { defaultBallId: '42' } }),
}))

vi.mock('../components/BowlingScorer', () => ({
  default: ({ gameNumber, defaultBallId }: { gameNumber: number; defaultBallId?: string }) => (
    <div data-testid="bowling-scorer" data-default-ball={defaultBallId ?? 'none'}>Game {gameNumber}</div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderSessionDetail(path: string) {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderSessions() {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter>
        <Sessions />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const detail = {
  id: 7,
  date: '2026-07-20',
  location: 'Purple Lanes',
  lanes: '5-6',
  notes: '',
  games: [
    { id: 1, gameNumber: 1, score: 180, strikes: 4, spares: 3, splits: 0, ballId: null },
    { id: 2, gameNumber: 4, score: 210, strikes: 6, spares: 2, splits: 0, ballId: null },
  ],
}

describe('session detail review fixes', () => {
  it('shows the total series dashboard and score path for every session', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(detail),
    )))

    renderSessionDetail('/sessions/7')

    expect(await screen.findByText('Your set, at a glance')).toBeTruthy()
    expect(screen.getByText('390', { exact: true })).toBeTruthy()
    expect(screen.getByText('+30', { exact: true })).toBeTruthy()
    expect(screen.getByText('How you got there')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Score path: Game 1, 180; Game 4, 210' })).toBeTruthy()
  })

  it('starts after the highest existing game number when numbering has gaps', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(detail),
    )))

    renderSessionDetail('/sessions/7?start=1')

    expect((await screen.findByTestId('bowling-scorer')).textContent).toBe('Game 5')
  })

  it('keeps an intentionally empty date invalid and resets the draft after cancel', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(detail),
    )))

    renderSessionDetail('/sessions/7?edit=1')

    const date = await screen.findByLabelText('Date') as HTMLInputElement
    await user.clear(date)
    expect(date.value).toBe('')
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Session actions' }))
    await user.click(screen.getByRole('button', { name: 'Edit details' }))
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-07-20')
  })

  it('normalizes nullable imported session fields before editing', async () => {
    const user = userEvent.setup()
    const importedDetail = { ...detail, location: null, lanes: null, notes: null }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(importedDetail),
    )))

    renderSessionDetail('/sessions/7')

    await user.click(await screen.findByRole('button', { name: 'Session actions' }))
    await user.click(screen.getByRole('button', { name: 'Edit details' }))

    expect((screen.getByLabelText('Center') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Lanes') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('deletes the selected game and refreshes the session', async () => {
    let detailRequests = 0
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([]))
      if (path === '/api/games/1' && init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (path === '/api/sessions/7') {
        detailRequests += 1
        return Promise.resolve(jsonResponse(detail))
      }
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderSessionDetail('/sessions/7')
    await user.click(await screen.findByRole('button', { name: 'Actions for game 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete game' }))
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete game' })
    await user.click(deleteButtons[deleteButtons.length - 1]!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games/1', { method: 'DELETE' }))
    await waitFor(() => expect(detailRequests).toBeGreaterThan(1))
    expect(screen.queryByRole('button', { name: 'Close game actions' })).toBeNull()
  })

  it('builds stored ribbons from physical frame data instead of stale serialized frames', async () => {
    const staleFrames = Array.from({ length: 10 }, () => ({
      ball1: 1,
      ball2: 1,
      ball3: null,
      score: 2,
      cumulative: 2,
      isStrike: false,
      isSpare: false,
    }))
    const ribbonDetail = {
      ...detail,
      games: [{
        ...detail.games[0],
        frameData: JSON.stringify({ frames: staleFrames, pinSelections: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]] }),
      }],
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(ribbonDetail),
    )))

    renderSessionDetail('/sessions/7')

    expect(await screen.findByLabelText('Frame 1, strike, Rolls X')).toBeTruthy()
    expect(screen.queryByLabelText('Frame 1, open, Rolls 1, 1, cumulative score 2')).toBeNull()
  })

  it('does not apply the settings default ball when editing a game with no stored ball', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/balls' ? jsonResponse([]) : jsonResponse(detail),
    )))
    const user = userEvent.setup()

    renderSessionDetail('/sessions/7')
    await user.click(await screen.findByRole('button', { name: 'Actions for game 1' }))
    await user.click(screen.getByRole('button', { name: 'Edit score' }))

    expect((screen.getByTestId('bowling-scorer') as HTMLElement).dataset.defaultBall).toBe('none')
  })
})

describe('session list review fixes', () => {
  it('preserves score order across months and uses the unnamed-center fallback', async () => {
    const scoreOrdered = [
      { id: 1, date: '2026-07-20', location: 'Alpha', lanes: '', notes: '', gameCount: 1, avgScore: 230, highScore: 230, perfectGames: 0 },
      { id: 2, date: '2026-06-20', location: 'Beta', lanes: '', notes: '', gameCount: 1, avgScore: 220, highScore: 220, perfectGames: 0 },
      { id: 3, date: '2026-07-10', location: null, lanes: '', notes: '', gameCount: 1, avgScore: 210, highScore: 210, perfectGames: 0 },
    ]
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ sessions: scoreOrdered, total: 3, limit: 20, offset: 0 }))))
    const user = userEvent.setup()

    const view = renderSessions()
    await screen.findByText('Alpha')
    await user.click(screen.getByRole('button', { name: 'Score' }))
    await screen.findByText('Highest scores')

    const sessionLinks = [...view.container.querySelectorAll<HTMLAnchorElement>('a.scoring-row-main')]
    expect(sessionLinks.map((link) => link.getAttribute('href'))).toEqual(['/sessions/1', '/sessions/2', '/sessions/3'])
    expect(screen.getByText('Center not named')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions for Center not named' })).toBeTruthy()
  })

  it('does not render an empty score group alongside the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ sessions: [], total: 0, limit: 20, offset: 0 }))))
    const user = userEvent.setup()

    renderSessions()
    await screen.findByText('No sessions yet')
    await user.click(screen.getByRole('button', { name: 'Score' }))

    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    expect(screen.queryByText('Highest scores')).toBeNull()
  })

  it('announces singular and plural perfect-game counts correctly', async () => {
    const sessions = [
      { id: 1, date: '2026-07-20', location: 'One Perfect', lanes: '', notes: '', gameCount: 3, avgScore: 250, highScore: 300, perfectGames: 1 },
      { id: 2, date: '2026-07-19', location: 'Two Perfect', lanes: '', notes: '', gameCount: 4, avgScore: 275, highScore: 300, perfectGames: 2 },
    ]
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ sessions, total: 2, limit: 20, offset: 0 }))))

    renderSessions()

    expect(await screen.findByLabelText('1 perfect game')).toBeTruthy()
    expect(screen.getByLabelText('2 perfect games')).toBeTruthy()
  })

  it('returns to the preceding page after deleting the only trailing session', async () => {
    let deleted = false
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (init?.method === 'DELETE') {
        deleted = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      const page = new URL(path, 'https://bowlsense.test').searchParams.get('page') ?? '1'
      const session = { id: Number(page), date: '2026-07-20', location: `Page ${page}`, lanes: '', notes: '', gameCount: 1, avgScore: 200, highScore: 200, perfectGames: 0 }
      return Promise.resolve(jsonResponse({ sessions: [session], total: deleted ? 40 : 41, limit: 20, offset: (Number(page) - 1) * 20 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderSessions()
    await screen.findByText('Page 1')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 3')
    expect(await screen.findByText('Page 3 of 3')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Actions for Page 3' }))
    await user.click(screen.getByRole('button', { name: 'Delete session' }))
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete session' })
    await user.click(deleteButtons[deleteButtons.length - 1]!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sessions/3', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close session actions' })).toBeNull())
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => (
      init?.method !== 'DELETE' && new URL(String(input), 'https://bowlsense.test').searchParams.get('page') === '2'
    ))).toBe(true))
    expect(await screen.findByText('Page 2 of 2')).toBeTruthy()
  })
})
