import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import PublicLeague from './PublicLeague'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the selected leaderboard tabpanel present and exposes a retryable load error', async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/share')) return Promise.resolve(new Response(JSON.stringify({ league: { id: 1, name: 'Test League', location: null, season: null, dayOfWeek: null }, weeks: [] }), { status: 200 }))
    if (path.endsWith('/leaderboard')) return Promise.resolve(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }))
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/leagues/1/public?tab=leaderboard']}><Routes><Route path="/leagues/:id/public" element={<PublicLeague />} /></Routes></MemoryRouter></QueryClientProvider>)

  const panel = await screen.findByRole('tabpanel')
  expect(panel.getAttribute('aria-labelledby')).toBe('league-leaderboard-tab')
  expect((await screen.findByRole('alert')).textContent).toContain('leaderboard could not be loaded')
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/leaderboard')).length).toBeGreaterThan(1)
})
