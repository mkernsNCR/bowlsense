import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import PublicLeague from './PublicLeague'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function successfulAuxiliaryResponse(path: string) {
  if (path.endsWith('/standings')) {
    return new Response(JSON.stringify({ seasonRecord: { wins: 0, losses: 0, ties: 0, totalPins: 0, totalGames: 0 }, weeks: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (path.endsWith('/leaderboard')) {
    return new Response(JSON.stringify({ record: { wins: 0, losses: 0, ties: 0 }, leagueAverage: 0, rankedOpponents: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}

it('keeps the selected leaderboard tabpanel present and exposes a retryable load error', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/share')) return Promise.resolve(new Response(JSON.stringify({ league: { id: 1, name: 'Test League', location: null, season: null, dayOfWeek: null }, weeks: [] }), { status: 200 }))
    if (path.endsWith('/leaderboard')) return Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }))
    return Promise.resolve(successfulAuxiliaryResponse(path))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public?tab=leaderboard']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)

  const panel = await screen.findByRole('tabpanel')
  expect(panel.getAttribute('aria-labelledby')).toBe('league-leaderboard-tab')
  const panels = screen.getAllByRole('tabpanel', { hidden: true })
  expect(panels.map((item) => item.id)).toEqual(['league-overview-panel', 'league-standings-panel', 'league-leaderboard-panel'])
  expect(panels.map((item) => item.hidden)).toEqual([true, true, false])
  for (const tab of screen.getAllByRole('tab')) {
    expect(document.getElementById(tab.getAttribute('aria-controls') || '')).not.toBeNull()
  }
  expect((await screen.findByRole('alert')).textContent).toContain('leaderboard could not be loaded')
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/leaderboard')).length).toBeGreaterThan(1)
})

it('distinguishes a league load failure from a missing league and offers retry', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })))
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)
  expect((await screen.findByRole('alert')).textContent).toContain('shared league could not be loaded')
  expect(screen.queryByText('League not found')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchMock.mock.calls.length).toBeGreaterThan(4)
})

it('renders a missing-league state only when the share endpoint returns 404', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/share')) return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } }))
    return Promise.resolve(successfulAuxiliaryResponse(path))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)

  expect(await screen.findByText('League not found')).not.toBeNull()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

it('shows a retryable statistics error without hiding valid shared weeks', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/share')) return Promise.resolve(new Response(JSON.stringify({ league: { id: 1, name: 'Test League', location: null, season: null, dayOfWeek: null }, weeks: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    if (path.endsWith('/stats')) return Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }))
    return Promise.resolve(successfulAuxiliaryResponse(path))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)

  expect((await screen.findByRole('alert')).textContent).toContain('statistics could not be loaded')
  expect(screen.queryByText('0W – 0L')).toBeNull()
  expect(screen.getByText('No weeks logged yet')).not.toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/stats')).length).toBeGreaterThan(1)
})

it('replaces misleading standings fallbacks with a retryable load error', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/share')) return Promise.resolve(new Response(JSON.stringify({ league: { id: 1, name: 'Test League', location: null, season: null, dayOfWeek: null }, weeks: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    if (path.endsWith('/standings')) return Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }))
    return Promise.resolve(successfulAuxiliaryResponse(path))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public?tab=standings']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)

  expect((await screen.findByRole('alert')).textContent).toContain('standings could not be loaded')
  expect(screen.queryByText(/Season Record/)).toBeNull()
  expect(screen.queryByText('No standings data yet.')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/standings')).length).toBeGreaterThan(1)
})
