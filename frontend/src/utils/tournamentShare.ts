export function getTournamentShareUrl(tournamentId: number): string {
  return `${window.location.origin}/tournaments/${tournamentId}/share`
}

export function getTournamentCardUrl(tournamentId: number): string {
  return `/api/tournaments/${tournamentId}/og-image`
}

export function getTournamentStandingsCardUrl(tournamentId: number): string {
  return `/api/tournaments/${tournamentId}/standings/og-image`
}

async function fetchTournamentCardFile(tournamentId: number, filename: string): Promise<File> {
  const res = await fetch(getTournamentCardUrl(tournamentId))
  if (!res.ok) throw new Error('Unable to fetch tournament card')
  const blob = await res.blob()
  return new File([blob], filename, { type: 'image/png' })
}

export async function copyTournamentShareLink(tournamentId: number): Promise<void> {
  await navigator.clipboard.writeText(getTournamentShareUrl(tournamentId))
}

export async function downloadTournamentCard(tournamentId: number, filename: string): Promise<void> {
  const file = await fetchTournamentCardFile(tournamentId, filename)
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadTournamentStandingsCard(tournamentId: number, filename: string): Promise<void> {
  const url = getTournamentStandingsCardUrl(tournamentId)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Unable to fetch standings card')
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(blobUrl)
}

export async function nativeShareTournament(opts: {
  tournamentId: number
  filename: string
  title: string
  text: string
}): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false

  const url = getTournamentShareUrl(opts.tournamentId)

  try {
    const file = await fetchTournamentCardFile(opts.tournamentId, opts.filename)
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