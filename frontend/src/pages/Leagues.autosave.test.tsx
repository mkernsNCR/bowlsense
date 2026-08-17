import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeLocalDraft } from '../features/autosave/localDraft'
import LeaguesPage, { LogWeekForm } from './Leagues'

function renderLogWeek() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LogWeekForm
        leagueId={8}
        gamesPerWeek={3}
        nextWeekNumber={4}
        balls={[]}
        location="Crofton"
        onSaved={vi.fn()}
        onDiscard={vi.fn()}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('league week autosave', () => {
  it('restores an active new-week game after navigating to another app page and back', async () => {
    writeLocalDraft('league:8:pending-week', null, {
      weekNumber: '1',
      date: '2026-08-12',
      opponent: 'Pin Crushers',
      gamesWon: '0',
      gamesLost: '0',
      notes: '',
      weekGames: [],
      scoringGame: 1,
      createdWeekId: null,
      savedGameNumbers: [],
    })
    writeLocalDraft('league:8:pending-week:game:1', null, {
      game: {
        gameNumber: 1,
        score: 0,
        strikes: 1,
        spares: 0,
        splits: 0,
        ballId: null,
        frameData: JSON.stringify({ pinSelections: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]] }),
        pinLeaves: JSON.stringify([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]),
      },
      selectedKnocked: [],
    })
    const league = {
      id: 8,
      name: 'Tuesday Classic',
      location: 'Crofton',
      season: '2026',
      dayOfWeek: 'Tuesday',
      gamesPerWeek: 3,
      startDate: null,
      endDate: null,
      notes: null,
      active: 1,
      weeks: [],
      stats: { average: 0, high: 0, low: 0, totalPins: 0, totalGames: 0, gamesWon: 0, gamesLost: 0, totalWeeks: 0 },
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => new Response(JSON.stringify(String(input) === '/api/balls' ? [] : league), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/leagues/8']}>
          <Routes>
            <Route path="/leagues/:id" element={<LeaguesPage />} />
            <Route path="/tournaments" element={<div>Other page <Link to="/leagues/8">Return to league</Link></div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Frame 2 · Ball 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Tournaments' }))
    expect(await screen.findByText('Other page')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Return to league' }))

    expect(await screen.findByText('Frame 2 · Ball 1')).toBeTruthy()
    expect(screen.getByText('Draft restored · changes save automatically on this device.')).toBeTruthy()
  })

  it('automatically reopens an autosaved edit when returning to an existing league game', async () => {
    const originalFrameData = JSON.stringify({
      pinSelections: Array.from({ length: 20 }, () => [] as number[]),
    })
    const draftFrameData = JSON.stringify({
      pinSelections: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    })
    writeLocalDraft('league:8:week:81:game:811', originalFrameData, {
      game: {
        gameNumber: 1,
        score: 0,
        strikes: 1,
        spares: 0,
        splits: 0,
        ballId: null,
        frameData: draftFrameData,
        pinLeaves: JSON.stringify([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]),
      },
      selectedKnocked: [],
    })
    const league = {
      id: 8,
      name: 'Tuesday Classic',
      location: 'Crofton',
      season: '2026',
      dayOfWeek: 'Tuesday',
      gamesPerWeek: 3,
      startDate: null,
      endDate: null,
      notes: null,
      active: 1,
      weeks: [{
        id: 81,
        leagueId: 8,
        weekNumber: 1,
        date: '2026-08-11',
        opponent: 'Pin Crushers',
        gamesWon: 2,
        gamesLost: 1,
        notes: null,
        games: [{
          id: 811,
          weekId: 81,
          gameNumber: 1,
          score: 0,
          strikes: 0,
          spares: 0,
          splits: 0,
          ballId: null,
          frameData: originalFrameData,
        }],
      }],
      stats: { average: 0, high: 0, low: 0, totalPins: 0, totalGames: 1, gamesWon: 2, gamesLost: 1, totalWeeks: 1 },
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => new Response(JSON.stringify(String(input) === '/api/balls' ? [] : league), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/leagues/8']}>
          <Routes>
            <Route path="/leagues/:id" element={<LeaguesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('dialog', { name: 'Edit game 1' })).toBeTruthy()
    expect(screen.getByText('Frame 2 · Ball 1')).toBeTruthy()
    expect(screen.getByText('Draft restored · changes save automatically on this device.')).toBeTruthy()
  })

  it('restores week fields, the active game, and its in-progress rolls after remounting', async () => {
    renderLogWeek()
    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'Pin Crushers' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Game 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Strike' }))

    await waitFor(() => expect(screen.getByText('Week draft saved automatically on this device.')).toBeTruthy())
    cleanup()
    renderLogWeek()

    expect((screen.getByLabelText('Opponent') as HTMLInputElement).value).toBe('Pin Crushers')
    expect(screen.getByText('Frame 2 · Ball 1')).toBeTruthy()
    expect(screen.getByText('Week draft restored. Changes save automatically on this device.')).toBeTruthy()
    expect(screen.getByText('Draft restored · changes save automatically on this device.')).toBeTruthy()
  })

  it('keeps completed games until the full week is submitted', async () => {
    renderLogWeek()
    fireEvent.click(screen.getByRole('button', { name: 'Start Game 1' }))
    for (let roll = 0; roll < 12; roll += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Strike' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save 300' }))
    await waitFor(() => expect(screen.getByText('Game 1: 300')).toBeTruthy())

    cleanup()
    renderLogWeek()

    expect(screen.getByText('Game 1: 300')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Game 2' })).toBeTruthy()
    expect(screen.getByText('Week draft restored. Changes save automatically on this device.')).toBeTruthy()
  })

  it('warns when the week draft cannot be written', async () => {
    renderLogWeek()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'QuotaExceededError')
    })

    fireEvent.change(screen.getByLabelText('Opponent'), { target: { value: 'Pin Crushers' } })

    await waitFor(() => expect(screen.getByText('Week draft could not be saved on this device. Keep this page open and check browser storage.')).toBeTruthy())
  })

  it('updates restored server-side week metadata before retrying its games', async () => {
    writeLocalDraft('league:8:pending-week', null, {
      weekNumber: '4',
      date: '2026-08-11',
      opponent: 'Updated Opponent',
      gamesWon: '2',
      gamesLost: '1',
      notes: 'Updated after the partial save',
      weekGames: [1, 2, 3].map((gameNumber) => ({
        gameNumber,
        score: 200 + gameNumber,
        strikes: 5,
        spares: 4,
        splits: 0,
        ballId: null,
        frameData: '{}',
      })),
      scoringGame: null,
      createdWeekId: 44,
      savedGameNumbers: [],
    })
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 44 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <LogWeekForm
          leagueId={8}
          gamesPerWeek={3}
          nextWeekNumber={5}
          balls={[]}
          onSaved={onSaved}
          onDiscard={vi.fn()}
        />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save week' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/leagues/weeks/44')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      date: '2026-08-11',
      opponent: 'Updated Opponent',
      gamesWon: 2,
      gamesLost: 1,
      notes: 'Updated after the partial save',
    })
  })
})
