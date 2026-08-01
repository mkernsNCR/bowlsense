import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText } from '../scoring/copyText'

const RESET_DELAY_MS = 1800

export function useCopyLink() {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  const copyLink = useCallback(async (requestedText?: unknown) => {
    const text = typeof requestedText === 'string' ? requestedText : window.location.href
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    try {
      await copyText(text)
      setCopied(true)
      resetTimer.current = window.setTimeout(() => {
        setCopied(false)
        resetTimer.current = null
      }, RESET_DELAY_MS)
      return true
    } catch {
      setCopied(false)
      return false
    }
  }, [])

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }, [])

  return { copied, copyLink }
}
