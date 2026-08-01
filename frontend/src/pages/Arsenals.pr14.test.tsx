import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ArsenalsPage from './Arsenals'

const apiMocks = vi.hoisted(() => ({
  arsenalJson: vi.fn(),
  arsenalRequest: vi.fn(),
  requestJson: vi.fn(),
}))

vi.mock('../features/gear/api', () => apiMocks)

const balls = [
  { id: 1, ballId: 11, role: 'Benchmark', slotOrder: 1, notes: null, ball: { id: 11, name: 'Ball A', brand: 'Alpha' } },
  { id: 2, ballId: 12, role: 'Dry Lane', slotOrder: 2, notes: null, ball: { id: 12, name: 'Ball B', brand: 'Beta' } },
  { id: 3, ballId: 13, role: 'Heavy Oil', slotOrder: 10, notes: null, ball: { id: 13, name: 'Ball C', brand: 'Gamma' } },
  { id: 4, ballId: 14, role: 'Spare', slotOrder: 20, notes: null, ball: { id: 14, name: 'Ball D', brand: 'Delta' } },
]

const detail = {
  id: 7,
  name: 'Travel bag',
  description: 'Tournament set',
  useCase: 'Tournament',
  maxSize: 2.8,
  notes: null,
  balls,
  stats: { gamesPlayed: 0, averageScore: 0, highGame: 0, byBall: [] },
}

function renderArsenals(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/arsenals" element={<ArsenalsPage />} />
          <Route path="/arsenals/new" element={<ArsenalsPage />} />
          <Route path="/arsenals/:id" element={<ArsenalsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMocks.arsenalJson.mockImplementation((suffix = '', init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve({ id: 99 })
    if (suffix) return Promise.resolve({ ...detail, id: Number(String(suffix).slice(1)) || 7 })
    return Promise.resolve([])
  })
  apiMocks.arsenalRequest.mockResolvedValue(undefined)
  apiMocks.requestJson.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Arsenals PR 14 regressions', () => {
  it('requires an integer bag capacity from 1 through 12 before creation', async () => {
    const user = userEvent.setup()
    renderArsenals('/arsenals/new')

    await user.type(await screen.findByLabelText('Arsenal name'), 'League bag')
    const capacity = screen.getByLabelText('Bag size') as HTMLInputElement
    const submit = screen.getByRole('button', { name: 'Build arsenal' }) as HTMLButtonElement

    fireEvent.change(capacity, { target: { value: '2.5' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(capacity, { target: { value: '13' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(capacity, { target: { value: '3' } })
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    await waitFor(() => expect(apiMocks.arsenalJson.mock.calls.some(([, init]) => {
      if (init?.method !== 'POST') return false
      return JSON.parse(String(init.body)).maxSize === 3
    })).toBe(true))
  })

  it('normalizes capacity before allocation and renders every overflow ball in order with recovery actions', async () => {
    const user = userEvent.setup()
    renderArsenals('/arsenals/7')

    expect(await screen.findByText('4 of 2 slots filled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit slot 1, Ball A' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit slot 2, Ball B' })).toBeTruthy()

    const overflow = screen.getByRole('list', { name: 'Over-capacity balls' })
    const entries = within(overflow).getAllByRole('listitem')
    expect(entries).toHaveLength(2)
    expect(entries[0]?.textContent).toContain('Overflow 1')
    expect(entries[0]?.textContent).toContain('Ball C')
    expect(entries[1]?.textContent).toContain('Overflow 2')
    expect(entries[1]?.textContent).toContain('Ball D')

    await user.click(screen.getByRole('button', { name: 'Remove Ball C from bag' }))
    await waitFor(() => expect(apiMocks.arsenalRequest).toHaveBeenCalledWith('/balls/3', { method: 'DELETE' }))
  })

  it('keeps critical Arsenal slot, role, and chip labels at 12px or larger', () => {
    const css = readFileSync('src/features/gear/gear.css', 'utf8')
    const selectors = [
      '.gear-chip',
      '.gear-capacity > span',
      '.gear-slot__number',
      '.gear-slot__copy span',
      '.gear-overflow__order',
      '.gear-overflow__copy span',
      '.gear-metric span',
      '.gear-coverage__item span',
    ]

    for (const selector of selectors) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rules = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
      const size = rules
        .map((match) => match[1]?.match(/font-size:\s*([0-9.]+)(px|rem)/))
        .find((match) => Boolean(match))
      expect(size, selector).toBeTruthy()
      const pixels = Number(size?.[1]) * (size?.[2] === 'rem' ? 16 : 1)
      expect(pixels, selector).toBeGreaterThanOrEqual(12)
    }
  })
})
