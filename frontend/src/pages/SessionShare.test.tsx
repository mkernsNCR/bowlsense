import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SessionShare from './SessionShare'

const shareMocks = vi.hoisted(() => ({
  copy: vi.fn(),
  download: vi.fn(),
  native: vi.fn(),
}))

vi.mock('../utils/sessionShare', () => ({
  downloadSessionCard: shareMocks.download,
  nativeShareSession: shareMocks.native,
}))

vi.mock('../features/scoring/copyText', () => ({
  copyText: shareMocks.copy,
}))

const payload = {
  session: { id: 7, date: '2026-07-20', location: 'Purple Lanes', lanes: '5-6', notes: '' },
  summary: { totalGames: 3, series: 600, average: 200, highGame: 220, perfectGames: 0 },
  games: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderSharePage() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))))
  return render(
    <MemoryRouter initialEntries={['/sessions/7/share']}>
      <Routes>
        <Route path="/sessions/:id/share" element={<SessionShare />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SessionShare native sharing', () => {
  it('does not copy the link after the user cancels native sharing', async () => {
    shareMocks.native.mockResolvedValue('cancelled')
    const user = userEvent.setup()
    renderSharePage()

    await user.click(await screen.findByRole('button', { name: /Share/ }))

    await waitFor(() => expect(shareMocks.native).toHaveBeenCalledTimes(1))
    expect(shareMocks.copy).not.toHaveBeenCalled()
  })

  it('copies the link when native sharing is unsupported', async () => {
    shareMocks.native.mockResolvedValue('unsupported')
    shareMocks.copy.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderSharePage()

    await user.click(await screen.findByRole('button', { name: /Share/ }))

    await waitFor(() => expect(shareMocks.copy).toHaveBeenCalledWith(window.location.href))
  })
})
