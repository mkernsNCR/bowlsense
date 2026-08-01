import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('falls back after Clipboard API rejection and cleans up the focused field', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select')
    const setSelectionRange = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange')
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await copyText('BowlSense score')

    expect(writeText).toHaveBeenCalledWith('BowlSense score')
    expect(focus).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledOnce()
    expect(setSelectionRange).toHaveBeenCalledWith(0, 'BowlSense score'.length)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('removes the fallback field when copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })

    await expect(copyText('Unavailable')).rejects.toThrow('Clipboard is unavailable')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
