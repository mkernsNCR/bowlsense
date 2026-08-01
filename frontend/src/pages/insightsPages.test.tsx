import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import PinLeaves from './PinLeaves'
import ScoreCalculator from './ScoreCalculator'
import Stats from './Stats'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as { execCommand?: (command: string) => boolean }).execCommand
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Insights pages', () => {
  it('only offers rolling-average windows backed by enough games', async () => {
    const stats = {
      overall: {
        average: 170,
        high: 190,
        low: 150,
        totalGames: 6,
        totalStrikes: 12,
        totalSpares: 10,
        strikeRate: 17,
        spareRate: 14,
        perfectGames: 0,
      },
      trend: { last5Avg: 180, last10Avg: 170, last20Avg: 170 },
      breakdown: {
        byMonth: [],
        byLocation: [],
        scoreDistribution: {
          sub150: 0,
          '150to179': 3,
          '180to199': 3,
          '200to224': 0,
          '225to249': 0,
          '250plus': 0,
        },
      },
    }
    const trend = {
      games: Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        score: 150 + index * 8,
        date: `2026-07-${String(index + 1).padStart(2, '0')}`,
        location: 'Bowl Center',
        gameNumber: index + 1,
      })),
      rolling5: [150, 154, 158, 162, 166, 174],
      rolling10: [150, 154, 158, 162, 166, 170],
      rolling20: [150, 154, 158, 162, 166, 170],
    }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(
      String(input) === '/api/stats/trend' ? jsonResponse(trend) : jsonResponse(stats),
    )))

    renderPage(<Stats />)

    expect(await screen.findByRole('button', { name: '5 games' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '10 games' })).toBeNull()
    expect(screen.queryByRole('button', { name: '20 games' })).toBeNull()
    expect(screen.queryByText(/20-game pace/i)).toBeNull()
    expect(screen.getByText('Last 5').closest('li')?.querySelector('b')?.textContent).toBe('180')
    expect(screen.getByText('Last 10').closest('li')?.textContent).toContain('Needs 4 more games')
    expect(screen.getByText('Last 10').closest('li')?.querySelector('b')?.textContent).toBe('—')
    expect(screen.getByText('Last 20').closest('li')?.textContent).toContain('Needs 14 more games')
    expect(screen.getByText('Last 20').closest('li')?.querySelector('b')?.textContent).toBe('—')
  })

  it('shows the newest six pin-leave months from newest to oldest', async () => {
    const leaves = {
      totalFirstThrows: 12,
      leaves: [{ pins: '7', count: 12, pct: 100, conversions: 3, conversionRate: 25 }],
      neverLeft: [],
      byMonth: Array.from({ length: 8 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, '0')}`,
        leaves: [{ pins: '7', count: index + 1 }],
      })),
    }
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(leaves))))

    const view = renderPage(<PinLeaves />)

    const heading = await screen.findByRole('heading', { name: 'Recent months' })
    const monthLabels = [...heading.closest('section')!.querySelectorAll('.insights-month > span')]
      .map((label) => label.textContent)
    expect(monthLabels).toEqual(['2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03'])
    expect(view.queryByText('2026-01')).toBeNull()
    expect(view.queryByText('2026-02')).toBeNull()
  })

  it('uses the displayed rounded average when calculating the required next score', () => {
    renderPage(<ScoreCalculator />)

    fireEvent.change(screen.getByLabelText('Game 1'), { target: { value: '199' } })
    fireEvent.change(screen.getByLabelText('Game 2'), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText('Target average'), { target: { value: '200' } })

    expect(screen.getByText(/Score at least/).textContent).toBe('Score at least 200 next to average 200.')
  })

  it('clears a stale copy failure when retrying the link succeeds', async () => {
    const copy = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })
    renderPage(<ScoreCalculator />)

    fireEvent.change(screen.getByLabelText('Game 1'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be copied')

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByRole('button', { name: 'Link copied' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(copy).toHaveBeenCalledTimes(2)
  })

  it('rounds every displayed average and keeps the takeaway internally consistent', async () => {
    const stats = {
      overall: { average: 170.4, high: 210, low: 140, totalGames: 20, totalStrikes: 40, totalSpares: 30, strikeRate: 25, spareRate: 20, perfectGames: 0 },
      trend: { last5Avg: 172.6, last10Avg: 171.5, last20Avg: 168.2 },
      breakdown: {
        byMonth: [{ month: '2026-07', games: 4, average: 169.7 }],
        byLocation: [{ location: 'Bowl Center', games: 6, average: 171.6 }],
        scoreDistribution: { sub150: 1, '150to179': 8, '180to199': 7, '200to224': 4, '225to249': 0, '250plus': 0 },
      },
    }
    const trend = { games: Array.from({ length: 20 }, (_, index) => ({ id: index + 1, score: 160 + index, date: '2026-07-01', location: 'Bowl Center', gameNumber: index + 1 })), rolling5: [], rolling10: [], rolling20: [] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(String(input) === '/api/stats/trend' ? jsonResponse(trend) : jsonResponse(stats))))

    renderPage(<Stats />)

    expect(await screen.findByText('Your last five are 5 pins ahead of your 20-game pace.')).toBeTruthy()
    expect(screen.getByText(/A 173 recent average.*168 baseline/)).toBeTruthy()
    expect(screen.getByText('Last 5').closest('li')?.querySelector('b')?.textContent).toBe('173')
    expect(screen.getByText('Last 10').closest('li')?.querySelector('b')?.textContent).toBe('172')
    expect(screen.getByText('Last 20').closest('li')?.querySelector('b')?.textContent).toBe('168')
    expect(screen.getByText('Bowl Center').closest('li')?.querySelector('b')?.textContent).toBe('172')
    expect(screen.getByText('2026-07').closest('li')?.querySelector('b')?.textContent).toBe('170')
  })

  it('marks the stats retry busy and disables repeat submissions', async () => {
    let resolveRetry!: (response: Response) => void
    const pendingRetry = new Promise<Response>((resolve) => { resolveRetry = resolve })
    let statsAttempts = 0
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/stats/trend') return Promise.resolve(jsonResponse({ games: [] }))
      statsAttempts += 1
      return statsAttempts === 1 ? Promise.resolve(new Response('failed', { status: 500 })) : pendingRetry
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage(<Stats />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fireEvent.click(retry)

    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(true))
    expect(retry.closest('section')?.getAttribute('aria-busy')).toBe('true')
    resolveRetry(jsonResponse({ overall: { totalGames: 0 } }))
  })

  it('marks the trend retry busy without blocking the scoring summary', async () => {
    const stats = {
      overall: { average: 170, high: 200, low: 140, totalGames: 5, totalStrikes: 10, totalSpares: 8, strikeRate: 20, spareRate: 16, perfectGames: 0 },
      trend: { last5Avg: 170, last10Avg: 0, last20Avg: 0 },
      breakdown: { byMonth: [], byLocation: [], scoreDistribution: { sub150: 1, '150to179': 2, '180to199': 1, '200to224': 1, '225to249': 0, '250plus': 0 } },
    }
    let resolveRetry!: (response: Response) => void
    const pendingRetry = new Promise<Response>((resolve) => { resolveRetry = resolve })
    let trendAttempts = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/stats/full') return Promise.resolve(jsonResponse(stats))
      trendAttempts += 1
      return trendAttempts === 1 ? Promise.resolve(new Response('failed', { status: 500 })) : pendingRetry
    }))

    renderPage(<Stats />)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    fireEvent.click(retry)

    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(true))
    expect(retry.closest('section')?.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('region', { name: 'Scoring summary' })).toBeTruthy()
    resolveRetry(jsonResponse({ games: [] }))
  })
})
