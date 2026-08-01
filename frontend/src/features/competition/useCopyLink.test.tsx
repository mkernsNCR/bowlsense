import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCopyLink } from './useCopyLink'

const copyMock = vi.hoisted(() => vi.fn())
vi.mock('../scoring/copyText', () => ({ copyText: copyMock }))

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useCopyLink', () => {
  it('copies the current URL and resets its confirmation consistently', async () => {
    vi.useFakeTimers()
    copyMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCopyLink())

    await act(() => result.current.copyLink())
    expect(copyMock).toHaveBeenCalledWith(window.location.href)
    expect(result.current.copied).toBe(true)

    act(() => vi.advanceTimersByTime(1800))
    expect(result.current.copied).toBe(false)
  })

  it('reports a copy failure without leaving a stale confirmation', async () => {
    copyMock.mockRejectedValue(new Error('clipboard unavailable'))
    const { result } = renderHook(() => useCopyLink())

    let copied = true
    await act(async () => { copied = await result.current.copyLink() })
    expect(copied).toBe(false)
    expect(result.current.copied).toBe(false)
  })
})
