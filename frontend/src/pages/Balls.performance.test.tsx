import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      requestedPaths.push(path)
      if (path === '/api/balls') return Promise.resolve(jsonResponse(balls))
      if (path === '/api/stats/by-ball') {
        return Promise.resolve(jsonResponse([{
          ballId: 1,
          ballName: 'Used Ball',
          brand: 'Track',
          gameCount: 4,
          average: 188,
        }]))
      }
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()

    const usedBall = (await screen.findByText('Used Ball')).closest('button')
    const freshBall = screen.getByText('Fresh Ball').closest('button')
    expect(usedBall?.textContent).toContain('4 games · 188 average')
    expect(freshBall?.textContent).toContain('Never used in a logged game')
    expect(requestedPaths).toContain('/api/balls')
    expect(requestedPaths).toContain('/stats/by-ball')
  })

  it('shows usage failures instead of claiming a ball was never used', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([{ id: 1, name: 'Test Ball', brand: null }]))
      if (path === '/stats/by-ball') return Promise.reject(new Error('stats unavailable'))
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()

    const ball = (await screen.findByText('Test Ball')).closest('button')
    await waitFor(() => expect(ball?.textContent).toContain('Usage unavailable'))
  })

  it('shows neutral usage copy while performance is still loading', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([{ id: 1, name: 'Patient Ball', brand: null }]))
      if (path === '/stats/by-ball') return new Promise<Response>(() => undefined)
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()

    const ball = (await screen.findByText('Patient Ball')).closest('button')
    expect(ball?.textContent).toContain('Loading usage…')
    expect(ball?.textContent).not.toContain('Never used')
  })

  it('classifies genuine urethane before finish keywords and ignores nullable search fields', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/api/balls') return Promise.resolve(jsonResponse([
        { id: 1, name: 'Pitch Black', brand: 'Storm', color: null, coverstockType: 'Solid Urethane' },
        { id: 2, name: 'Reactive Mix', brand: null, color: null, coverstockType: 'Reactive Urethane Solid' },
      ]))
      if (path === '/stats/by-ball') return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()
    await screen.findByText('Pitch Black')

    fireEvent.change(screen.getByLabelText('Filter by coverstock'), { target: { value: 'urethane' } })
    expect(screen.getByText('Pitch Black')).toBeTruthy()
    expect(screen.queryByText('Reactive Mix')).toBeNull()

    fireEvent.change(screen.getByLabelText('Search your ball library'), { target: { value: 'undefined' } })
    expect(screen.getByText('No equipment matches')).toBeTruthy()
  })

  it('resets a dismissed add draft and uses the native catalog route', async () => {
    const requestedPaths: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      requestedPaths.push(path)
      if (path === '/api/balls' && init?.method === 'POST') {
        return Promise.resolve(new Response('save failed', { status: 500 }))
      }
      if (path === '/api/balls') return Promise.resolve(jsonResponse([]))
      if (path === '/stats/by-ball') return Promise.resolve(jsonResponse([]))
      if (path.startsWith('/balls/search?')) return Promise.resolve(jsonResponse([]))
      return Promise.resolve(jsonResponse([]))
    }))

    renderBalls()
    await screen.findByText('Your locker is empty')
    fireEvent.click(screen.getByRole('button', { name: 'Add your first ball' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manual entry' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Draft Ball' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save ball' }))
    expect(await screen.findByText('The ball could not be saved. Check the connection and try again.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close Add a ball' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add your first ball' }))
    expect(screen.getByRole('button', { name: 'Search catalog' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('The ball could not be saved. Check the connection and try again.')).toBeNull()

    fireEvent.change(screen.getByLabelText('Ball name'), { target: { value: 'Zen' } })
    await waitFor(() => expect(requestedPaths.some((path) => path.startsWith('/balls/search?q=Zen'))).toBe(true))
  })
})
