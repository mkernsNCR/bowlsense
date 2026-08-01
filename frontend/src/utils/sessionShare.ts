export function getSessionShareUrl(sessionId: number): string {
  return `${window.location.origin}/sessions/${sessionId}/share`
}

export function getSessionCardUrl(sessionId: number): string {
  return `/api/sessions/${sessionId}/og-image`
}

async function fetchSessionCardFile(sessionId: number, filename: string): Promise<File> {
  const res = await fetch(getSessionCardUrl(sessionId))
  if (!res.ok) throw new Error('Unable to fetch session card')
  const blob = await res.blob()
  return new File([blob], filename, { type: 'image/png' })
}

export async function copySessionShareLink(sessionId: number): Promise<void> {
  await navigator.clipboard.writeText(getSessionShareUrl(sessionId))
}

export async function downloadSessionCard(sessionId: number, filename: string): Promise<void> {
  const file = await fetchSessionCardFile(sessionId, filename)
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type NativeShareOutcome = 'shared' | 'cancelled' | 'unsupported'

export async function nativeShareSession(opts: {
  sessionId: number
  filename: string
  title: string
  text: string
}): Promise<NativeShareOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported'

  const url = getSessionShareUrl(opts.sessionId)

  try {
    const file = await fetchSessionCardFile(opts.sessionId, opts.filename)
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url,
        files: [file],
      })
      return 'shared'
    }

    await navigator.share({
      title: opts.title,
      text: `${opts.text} ${url}`,
      url,
    })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'unsupported'
  }
}
