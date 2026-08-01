import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import SettingsPage from './Settings'

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { name: 'Owner', homeLanes: '', defaultBallId: '' },
    setSettings: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('requires explicit destructive confirmation before importing a backup', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith('/api/balls')) return new Response('[]', { status: 200 })
    if (path.endsWith('/api/backups')) return new Response(JSON.stringify({ backupBackend: 'sites-managed', backups: [], latestMtime: null, backupCount: 0 }), { status: 200 })
    if (path.endsWith('/api/data-health')) return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), dbFile: { exists: true, path: 'sites-managed', sizeBytes: 0, mtime: null, ageMinutes: null }, tableCounts: [], backupHealth: { count: 0, latest: null, latestAgeHours: null, hasRecentBackup: false }, warnings: [] }), { status: 200 })
    if (path.endsWith('/api/import') && init?.method === 'POST') return new Response(JSON.stringify({ imported: { sessions: 1, games: 2, balls: 1 } }), { status: 200 })
    return new Response(JSON.stringify({ error: 'Unexpected request' }), { status: 500 })
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container } = render(<QueryClientProvider client={client}><MemoryRouter><SettingsPage /></MemoryRouter></QueryClientProvider>)
  const input = container.querySelector<HTMLInputElement>('input[accept=".json"]')
  const file = new File([JSON.stringify({ sessions: [] })], 'backup.json', { type: 'application/json' })
  if (!input) throw new Error('Backup input was not rendered')

  fireEvent.change(input, { target: { files: [file] } })
  expect(await screen.findByRole('alertdialog', { name: 'Replace all BowlSense data?' })).toBeTruthy()
  expect(fetchMock.mock.calls.filter(([request, options]) => String(request).endsWith('/api/import') && options?.method === 'POST')).toHaveLength(0)

  fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }))
  expect(screen.queryByRole('alertdialog', { name: 'Replace all BowlSense data?' })).toBeNull()
  expect(fetchMock.mock.calls.filter(([request, options]) => String(request).endsWith('/api/import') && options?.method === 'POST')).toHaveLength(0)

  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(await screen.findByRole('button', { name: 'Replace all data' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([request, options]) => String(request).endsWith('/api/import') && options?.method === 'POST')).toHaveLength(1))
})
