import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Balls from './Balls'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderBalls() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Balls /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Balls performance', () => {
  it('shows usage for matched balls and preserves the never-used state', async () => {
    const balls = [
      { id: 1, name: 'Used Ball', brand: 'Track', coverstockType: 'Solid' },
      { id: 2, name: 'Fresh Ball', brand: 'Track', coverstockType: 'Pearl' },
    ]
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse(balls))
      if (path === '/stats/by-ball') {
        return Promise.resolve(jsonResponse([{
          ballId: 1,
          ballName: 'Used Ball',
          brand: 'Track',
          gameCount: 4,
          average: 188,
        }]))
      }
      if (path === '/api/stats/by-ball') {
        return Promise.resolve(jsonResponse([{
          name: 'Used Ball',
          game_count: 4,
          avg_score: 188,
          high_game: 211,
        }]))
      }
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()

    const usedBall = (await screen.findByText('Used Ball')).closest('button')
    const freshBall = screen.getByText('Fresh Ball').closest('button')
    expect(usedBall?.textContent).toContain('4 games · 188 average')
    expect(freshBall?.textContent).toContain('Never used in a logged game')
  })
})
