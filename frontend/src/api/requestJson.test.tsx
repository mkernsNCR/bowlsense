import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestJson } from './requestJson'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('requestJson', () => {
  it('aborts an unbounded request after the default timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input, init) => {
      const signal = init?.signal as AbortSignal
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = requestJson('/api/slow')
    const receivedSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal
    const rejection = expect(request).rejects.toBeTruthy()
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('preserves a caller-provided signal', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/api/data', { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })
})
