import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeShareSession } from './sessionShare'

const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share')
const canShareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'canShare')

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor)
  } else {
    Reflect.deleteProperty(target, key)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  restoreProperty(navigator, 'share', shareDescriptor)
  restoreProperty(navigator, 'canShare', canShareDescriptor)
})

const options = {
  sessionId: 7,
  filename: 'session.png',
  title: 'BowlSense Session',
  text: 'Three games',
}

function stubCardFetch() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(new Blob(['image'], { type: 'image/png' }), { status: 200 }))))
}

describe('nativeShareSession', () => {
  it('returns unsupported when native sharing is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })

    await expect(nativeShareSession(options)).resolves.toBe('unsupported')
  })

  it('returns shared after native sharing succeeds', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => false) })
    stubCardFetch()

    await expect(nativeShareSession(options)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: 'BowlSense Session',
      url: `${window.location.origin}/sessions/7/share`,
    }))
  })

  it('returns cancelled when the user dismisses the native share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Share cancelled', 'AbortError'))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => false) })
    stubCardFetch()

    await expect(nativeShareSession(options)).resolves.toBe('cancelled')
  })
})
