import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
})
