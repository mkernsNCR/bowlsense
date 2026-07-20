export function getGameShareUrl(gameId: number): string {
  return `${window.location.origin}/score/${gameId}`
}

export function shareOnX(gameId: number, score: number, location?: string | null) {
  const text = `I scored ${score} at ${location || 'the alley'}! 🎳 #BowlSense`
  const url = getGameShareUrl(gameId)
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  window.open(tweetUrl, '_blank', 'noopener,noreferrer')
}

export function getGameOgImageUrl(gameId: number): string {
  return `/api/games/${gameId}/og-image`
}

export async function copyGameShareLink(gameId: number): Promise<void> {
  await navigator.clipboard.writeText(getGameShareUrl(gameId))
}

async function fetchGameImageFile(gameId: number, filename: string): Promise<File> {
  const res = await fetch(getGameOgImageUrl(gameId))
  if (!res.ok) throw new Error('Unable to fetch game image')

  const blob = await res.blob()
  return new File([blob], filename, { type: 'image/png' })
}

export async function downloadGameImage(gameId: number, filename: string): Promise<void> {
  const file = await fetchGameImageFile(gameId, filename)
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function nativeShareGame(opts: {
  gameId: number
  filename: string
  title: string
  text: string
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false

  const url = getGameShareUrl(opts.gameId)

  try {
    const file = await fetchGameImageFile(opts.gameId, opts.filename)
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url,
        files: [file],
      })
      return true
    }

    await navigator.share({
      title: opts.title,
      text: `${opts.text} ${url}`,
      url,
    })
    return true
  } catch {
    return false
  }
}
