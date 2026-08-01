import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuickAddGame from '../../components/QuickAddGame'
import NewSession from '../../pages/NewSession'
import QuickAdd from '../../pages/QuickAdd'
import QuickStart from '../../pages/QuickStart'
import { createGameRequest, createSessionRequest } from '../../api/bowling'
import { readableDate } from './date'

vi.mock('../../components/BowlingScorer', () => ({
  default: ({ gameNumber, onSave }: {
    gameNumber: number
    onSave: (game: Record<string, unknown>) => void | Promise<void>
  }) => (
    <div>
      <span>Test scorer game {gameNumber}</span>
      <button
        type="button"
        onClick={() => onSave({
          gameNumber,
          score: 100,
          strikes: 1,
          spares: 2,
          splits: 0,
          ballId: null,
          frameData: '{}',
        })}
      >
        Save test game
      </button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function stubQuickFlowFetch({ gameResponse }: { gameResponse?: Promise<Response> } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'POST' && path === '/api/sessions') return Promise.resolve(jsonResponse({ id: 42 }))
    if (method === 'POST' && path === '/api/games') return gameResponse ?? Promise.resolve(jsonResponse({ id: 99 }))
    if (path.startsWith('/api/sessions?limit=') && path.endsWith('&offset=0')) {
      return Promise.resolve(jsonResponse([{
        id: 7,
        date: '2026-07-30',
        location: null,
        lanes: null,
        notes: null,
      }]))
    }
    if (path === '/api/balls') return Promise.resolve(jsonResponse([]))
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderWithClient(node: React.ReactNode, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  return {
    queryClient,
    view: render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{node}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('quick scoring flows', () => {
  it('keeps an existing session aligned, allows lane ranges, and restarts at the next game', async () => {
    stubQuickFlowFetch()
    const onDone = vi.fn()
    renderWithClient(<QuickAddGame onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: /Add details/i }))
    expect(screen.getByLabelText(/Lanes/i).getAttribute('inputmode')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start bowling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save test game' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce(), { timeout: 1500 })
    expect((screen.getByLabelText('Date') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Center') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Lanes/i) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Additional games stay in this created session.')).toBeTruthy()

    const startAnother = onDone.mock.calls[0]?.[1] as (() => void) | undefined
    act(() => startAnother?.())
    expect(screen.getByText('Test scorer game 2')).toBeTruthy()
  })

  it('reports completion without scheduling a second save confirmation', async () => {
    const pendingGame = deferred<Response>()
    const fetchMock = stubQuickFlowFetch({ gameResponse: pendingGame.promise })
    const onDone = vi.fn()
    renderWithClient(<QuickAddGame onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start bowling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save test game' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/games', expect.anything()))
    expect(onDone).not.toHaveBeenCalled()

    pendingGame.resolve(jsonResponse({ id: 99 }))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('keeps create request failures specific to their operation', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({}, 500))))

    await expect(createSessionRequest({ date: '2026-08-01', location: 'Home Lanes', lanes: '' }))
      .rejects.toThrow('Session could not be created.')
    await expect(createGameRequest({
      sessionId: 42,
      gameNumber: 1,
      score: 100,
      strikes: 1,
      spares: 2,
      splits: 0,
      ballId: null,
      frameData: '{}',
    })).rejects.toThrow('Game could not be saved.')
  })

  it('shows one parent confirmation and clears it when scoring restarts', async () => {
    stubQuickFlowFetch()
    renderWithClient(<QuickStart />)

    expect(await screen.findByText('Center not named')).toBeTruthy()
    expect(screen.getByText(`${readableDate('2026-07-30')} · 0 games`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start bowling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save test game' }))

    expect(await screen.findByRole('heading', { name: 'Game saved' }, { timeout: 1500 })).toBeTruthy()
    expect(screen.getAllByText('Game saved')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Open score' }).getAttribute('href')).toBe('/score/99')
    expect(screen.getByRole('link', { name: 'View sessions' }).getAttribute('href')).toBe('/sessions')

    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(screen.queryByText('Game saved')).toBeNull()
    expect(screen.getByText('Test scorer game 2')).toBeTruthy()
  })

  it('keeps the standalone quick-add session when adding another game', async () => {
    stubQuickFlowFetch()
    renderWithClient(<QuickAdd />)

    fireEvent.click(screen.getByRole('button', { name: 'Start bowling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save test game' }))

    expect(await screen.findByRole('heading', { name: 'Game saved' }, { timeout: 1500 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))

    expect(screen.queryByText('Game saved')).toBeNull()
    expect(screen.getByText('Test scorer game 2')).toBeTruthy()
  })

  it('navigates after session creation without waiting for query refetches', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({ id: 42 }))
    vi.stubGlobal('fetch', fetchMock)
    const { queryClient } = renderWithClient(
      <Routes>
        <Route path="/sessions/new" element={<NewSession />} />
        <Route path="/sessions/:id" element={<div>Session target</div>} />
      </Routes>,
      ['/sessions/new'],
    )
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise(() => undefined))

    expect(screen.getByLabelText(/Lanes/i).getAttribute('inputmode')).toBeNull()
    fireEvent.change(screen.getByLabelText('Center'), { target: { value: '  Bowl Center  ' } })
    fireEvent.change(screen.getByLabelText(/Lanes/i), { target: { value: '  5–6  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add details' }))
    fireEvent.change(screen.getByLabelText('Notes or conditions'), { target: { value: '  Fresh oil  ' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Start bowling' }).closest('form')!)

    expect(await screen.findByText('Session target')).toBeTruthy()
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      location: 'Bowl Center',
      lanes: '5–6',
      notes: 'Fresh oil',
    })
  })
})
