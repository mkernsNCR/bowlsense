import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeLocalDraft } from '../features/autosave/localDraft'
import { LogWeekForm } from './Leagues'

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
