import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor)
  } else {
    Reflect.deleteProperty(target, key)
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  restoreProperty(navigator, 'clipboard', clipboardDescriptor)
  restoreProperty(window, 'isSecureContext', secureContextDescriptor)
  restoreProperty(document, 'execCommand', execCommandDescriptor)
})

describe('copyText', () => {
  it('falls back after Clipboard API rejection, positions the field, and restores focus', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    const previous = document.createElement('button')
    document.body.appendChild(previous)
    previous.focus()
    const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select')
    const setSelectionRange = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange')
    const execCommand = vi.fn(() => {
      const field = document.querySelector('textarea')
      expect(field?.style.top).toBe('0px')
      expect(field?.style.left).toBe('0px')
      return true
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await copyText('BowlSense score')

    expect(writeText).toHaveBeenCalledWith('BowlSense score')
    expect(select).toHaveBeenCalledOnce()
    expect(setSelectionRange).toHaveBeenCalledWith(0, 'BowlSense score'.length)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(previous)
  })

  it('removes the fallback field when copying fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })

    const previous = document.createElement('button')
    document.body.appendChild(previous)
    previous.focus()

    await expect(copyText('Unavailable')).rejects.toThrow('Clipboard is unavailable')
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(previous)
  })
})
