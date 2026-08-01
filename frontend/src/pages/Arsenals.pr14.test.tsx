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
    fireEvent.change(capacity, { target: { value: '' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(capacity, { target: { value: '1' } })
    expect(submit.disabled).toBe(false)
    fireEvent.change(capacity, { target: { value: '12' } })
    expect(submit.disabled).toBe(false)
    fireEvent.change(capacity, { target: { value: '3' } })
    expect(submit.disabled).toBe(false)
    await user.click(submit)

    await waitFor(() => expect(apiMocks.arsenalJson.mock.calls.some(([, init]) => {
      if (init?.method !== 'POST') return false
      return JSON.parse(String(init.body)).maxSize === 3
    })).toBe(true))
  })

  it('persists bag notes, slot reassignment, and entry notes without losing saved state', async () => {
    const user = userEvent.setup()
    let currentDetail = {
      ...detail,
      maxSize: 3,
      balls: [balls[0]],
    }
    apiMocks.arsenalJson.mockImplementation((suffix = '') => {
      if (suffix) return Promise.resolve(currentDetail)
      return Promise.resolve([])
    })
    apiMocks.arsenalRequest.mockImplementation((suffix: string, init?: RequestInit) => {
      const payload = init?.body ? JSON.parse(String(init.body)) : null
      if (suffix === '/7') currentDetail = { ...currentDetail, notes: payload.notes }
      if (suffix === '/balls/1') {
        currentDetail = {
          ...currentDetail,
          balls: currentDetail.balls.map((entry) => entry.id === 1 ? { ...entry, ...payload } : entry),
        }
      }
      return Promise.resolve(undefined)
    })

    renderArsenals('/arsenals/7')

    expect(await screen.findByText('1 of 3 slots filled')).toBeTruthy()
    const notes = screen.getByLabelText('Arsenal notes')
    const saveNotes = screen.getByRole('button', { name: 'Save notes' }) as HTMLButtonElement
    expect(saveNotes.disabled).toBe(true)
    await user.type(notes, 'Move left after game two')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(saveNotes.disabled).toBe(false)
    await user.click(saveNotes)

    await waitFor(() => expect(apiMocks.arsenalRequest).toHaveBeenCalledWith('/7', expect.objectContaining({
      method: 'PUT',
      body: expect.stringContaining('Move left after game two'),
    })))
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Edit slot 1, Ball A' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Slot'), '2')
    await user.type(within(dialog).getByLabelText('Notes'), 'Fresh only')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(apiMocks.arsenalRequest).toHaveBeenCalledWith('/balls/1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ role: 'Benchmark', slotOrder: 2, notes: 'Fresh only' }),
    })))
  })

  it('announces labels with each per-ball performance value', async () => {
    apiMocks.arsenalJson.mockImplementation((suffix = '') => suffix ? Promise.resolve({
      ...detail,
      stats: {
        ...detail.stats,
        byBall: [{ ballId: 11, ballName: 'Ball A', role: 'Benchmark', gamesPlayed: 4, averageScore: 188, highGame: 211 }],
      },
    }) : Promise.resolve([]))

    renderArsenals('/arsenals/7')

    expect((await screen.findByTitle('Games')).textContent).toBe('Games: 4g')
    expect(screen.getByTitle('Average').textContent).toBe('Average: 188')
    expect(screen.getByTitle('High game').textContent).toBe('High game: 211')
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
    const cssUrl = new URL(['..', 'features', 'gear', 'gear.css'].join('/'), import.meta.url)
    const css = readFileSync(decodeURIComponent(cssUrl.pathname), 'utf8')
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
      const declarations = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((match) => match[1]?.split(',').some((candidate) => candidate.trim() === selector))
        .flatMap((match) => [...(match[2] || '').matchAll(/font-size:\s*([0-9.]+)(px|rem)/g)])
      expect(declarations.length, selector).toBeGreaterThan(0)
      for (const declaration of declarations) {
        const pixels = Number(declaration[1]) * (declaration[2] === 'rem' ? 16 : 1)
        expect(pixels, selector).toBeGreaterThanOrEqual(12)
      }
    }
  })
})
