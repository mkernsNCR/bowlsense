import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BowlingScorer from '../../components/BowlingScorer'
import Dashboard from '../../pages/Dashboard'
import { QuickLogSheet } from './QuickLogSheet'
import { RecentSessions } from './RecentSessions'
import { TodayFrameRibbon } from './TodayFrameRibbon'
import { parseFrameRibbonFrames } from './frameMarks'

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

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

function dashboardGetResponse(path: string) {
  if (path === '/api/stats') return jsonResponse({ average: 0, strikeRate: 0, spareRate: 0, totalGames: 0 })
  if (path === '/api/stats/weekly') {
    return jsonResponse({
      thisWeek: { games: 0, average: 0, highGame: 0 },
      lastWeek: { games: 0, average: 0, highGame: 0 },
      delta: { average: null, games: 0, highGame: 0 },
      dayOfWeek: 'Thursday',
    })
  }
  if (path.startsWith('/api/sessions?')) return jsonResponse([])
  if (path === '/api/games-recent') return jsonResponse([])
  if (path === '/api/balls') return jsonResponse([])
  if (path === '/api/dashboard/tonight') {
    return jsonResponse([{
      id: 5,
      name: 'Thursday League',
      location: 'Purple Lanes',
      season: 'Summer',
      gamesPerWeek: 3,
      startDate: '2026-06-01',
      endDate: '2026-09-01',
      todayName: 'Thursday',
      todayIso: '2026-07-30',
      inSeason: true,
      nextWeekNumber: 8,
      lastOpponent: null,
      lastWeekDate: null,
      stats: { average: 0, high: 0, totalGames: 0, totalWeeks: 0, gamesWon: 0, gamesLost: 0 },
    }])
  }
  return jsonResponse({ error: 'Unexpected request' }, 500)
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function finishGutterGame(user: ReturnType<typeof userEvent.setup>) {
  for (let roll = 0; roll < 20; roll += 1) {
    await user.click(screen.getByRole('button', { name: 'Record 0' }))
  }
}

describe('Today behavior', () => {
  it('classifies partial frames and tenth-frame fills from scoring data', () => {
    const partial = parseFrameRibbonFrames(JSON.stringify({ frames: [{ ball1: 7 }] }))
    expect(partial[0]).toMatchObject({ rolls: ['7'], state: 'partial' })

    const frames = Array.from({ length: 10 }, () => ({}))
    frames[9] = { ball1: 9, ball2: 0, ball3: 10 }
    const tenth = parseFrameRibbonFrames(JSON.stringify({ frames }))
    expect(tenth[9]).toMatchObject({ rolls: ['9', '–', 'X'], state: 'open' })
  })

  it('announces recent sessions as a navigable list', () => {
    render(
      <MemoryRouter>
        <RecentSessions
          sessions={[
            {
              id: 7,
              date: '2026-07-30',
              location: 'Purple Lanes',
              lanes: '12-13',
              notes: null,
              gameCount: 3,
              avgScore: 201,
              highScore: 223,
            },
          ]}
        />
      </MemoryRouter>,
    )

    const list = screen.getByRole('list')
    const item = within(list).getByRole('listitem')
    const link = within(item).getByRole('link', { name: /Purple Lanes/i })
    expect(link.getAttribute('href')).toBe('/sessions/7')
  })

  it('announces saved games with and without frame details', () => {
    const view = render(<TodayFrameRibbon score={187} gameNumber={2} location="Purple Lanes" frames={null} />)

    expect(screen.getByText('Frame details weren’t recorded for this game.')).toBeTruthy()
    expect(screen.getByText('Purple Lanes, score 187. Frame details weren’t recorded for this game.')).toBeTruthy()

    view.rerender(
      <TodayFrameRibbon
        score={187}
        gameNumber={2}
        location="Purple Lanes"
        frames={JSON.stringify({ frames: [{ ball1: 10, cumulative: 30 }] })}
      />,
    )
    expect(screen.getByText((content, element) => (
      element?.tagName === 'FIGCAPTION' && content.includes('Frame 1: X, total 30')
    ))).toBeTruthy()
  })

  it('announces dashboard loading after the persistent live region mounts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
    renderDashboard()

    const status = await screen.findByRole('status')
    await waitFor(() => expect(status.textContent).toBe('Loading your latest bowling activity.'))
  })

  it('locks created-session fields and prevents dismissal while saving', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const view = render(
      <MemoryRouter>
        <QuickLogSheet
          open
          draft={{
            date: '2026-07-30',
            location: 'Purple Lanes',
            lanes: '12-13',
            sessionId: null,
            gameNumber: 2,
            saved: false,
          }}
          status={{ saving: true, error: false }}
          balls={[]}
          onDraftChange={() => undefined}
          onSave={async () => undefined}
          onClose={onClose}
          onLogAnother={() => undefined}
        />
      </MemoryRouter>,
    )

    expect((screen.getByLabelText('Center') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Date') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Lanes/i) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Close past-game log' }) as HTMLButtonElement).disabled).toBe(true)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    view.rerender(
      <MemoryRouter>
        <QuickLogSheet
          open
          draft={{
            date: '2026-07-30',
            location: 'Purple Lanes',
            lanes: '12-13',
            sessionId: 42,
            gameNumber: 2,
            saved: false,
          }}
          status={{ saving: false, error: false }}
          balls={[]}
          onDraftChange={() => undefined}
          onSave={async () => undefined}
          onClose={onClose}
          onLogAnother={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Additional games stay in this created session.')).toBeTruthy()
  })

  it('disables the completed-game save control while a save is pending', async () => {
    const user = userEvent.setup()
    render(
      <BowlingScorer
        gameNumber={1}
        balls={[]}
        saving
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    )

    await finishGutterGame(user)

    expect((await screen.findByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Retake' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates one session for duplicate save events and resets for another game', async () => {
    const user = userEvent.setup()
    let sessionRequests = 0
    let resolveSession: ((response: Response) => void) | undefined
    const pendingSession = new Promise<Response>((resolve) => {
      resolveSession = resolve
    })
    let statsRequests = 0
    let resolveStatsRefresh: ((response: Response) => void) | undefined
    const pendingStatsRefresh = new Promise<Response>((resolve) => {
      resolveStatsRefresh = resolve
    })
    const savedGames: Array<Record<string, unknown>> = []

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      const method = init?.method ?? 'GET'
      if (method === 'POST' && path === '/api/sessions') {
        sessionRequests += 1
        return pendingSession
      }
      if (method === 'POST' && path === '/api/games') {
        savedGames.push(JSON.parse(String(init?.body)))
        return Promise.resolve(jsonResponse({ id: 99 }))
      }
      if (path === '/api/stats') {
        statsRequests += 1
        if (statsRequests > 1) return pendingStatsRefresh
      }
      return Promise.resolve(dashboardGetResponse(path))
    }))

    renderDashboard()

    const leagueLink = await screen.findByRole('link', { name: /View Thursday League/i })
    expect(leagueLink.getAttribute('href')).toBe('/leagues/5')
    await user.click(screen.getAllByRole('button', { name: 'Log a past game' })[0]!)
    await finishGutterGame(user)

    const save = await screen.findByRole('button', { name: 'Save game' })
    act(() => {
      fireEvent.click(save)
      fireEvent.click(save)
    })
    await waitFor(() => expect(sessionRequests).toBeGreaterThan(0))
    expect(sessionRequests).toBe(1)

    resolveSession?.(jsonResponse({ id: 42 }))
    await waitFor(() => expect(statsRequests).toBe(2))
    expect(screen.queryByText('Game logged')).toBeNull()
    expect(screen.getByText('Saving game…')).toBeTruthy()

    resolveStatsRefresh?.(dashboardGetResponse('/api/stats'))
    await screen.findByText('Game logged')
    expect(JSON.parse(String(savedGames[0]?.pinLeaves))).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'Log another game' }))
    expect(screen.queryByText('Game logged')).toBeNull()
    expect(screen.getByRole('button', { name: 'Record 0' })).toBeTruthy()
  })

  it('clears a failed save when the quick log is reopened', async () => {
    const user = userEvent.setup()
    let sessionAttempts = 0

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      const method = init?.method ?? 'GET'
      if (method === 'POST' && path === '/api/sessions') {
        sessionAttempts += 1
        return Promise.resolve(jsonResponse({ error: 'Save failed' }, 500))
      }
      return Promise.resolve(dashboardGetResponse(path))
    }))

    renderDashboard()
    await screen.findByRole('link', { name: /View Thursday League/i })
    await user.click(screen.getAllByRole('button', { name: 'Log a past game' })[0]!)
    await finishGutterGame(user)
    await user.click(screen.getByRole('button', { name: 'Save game' }))

    await screen.findByText('The game wasn’t saved. Check your connection and try again.')
    expect(sessionAttempts).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Close completed game' }))
    await user.click(screen.getByRole('button', { name: 'Discard game' }))
    await user.click(screen.getAllByRole('button', { name: 'Log a past game' })[0]!)
    expect(screen.queryByText('The game wasn’t saved. Check your connection and try again.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Record 0' })).toBeTruthy()
  })
})
