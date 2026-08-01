export interface Session {
  id: number
  date: string
  location: string | null
  lanes: string | null
  notes: string | null
  gameCount?: number
  avgScore?: number
  highScore?: number
  perfectGames?: number
}

export interface Ball {
  id: number
  name: string
  brand?: string
  thumbnailImage?: string
}

export interface SavedGame {
  gameNumber: number
  score: number
  strikes: number
  spares: number
  splits: number
  ballId: number | null
  frameData: string
  pinLeaves?: string
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchBalls() {
  return fetchJson<Ball[]>('/api/balls')
}

export async function fetchRecentSessions(limit = 100) {
  const data = await fetchJson<Session[] | { sessions?: Session[] }>(`/api/sessions?limit=${limit}&offset=0`)
  return Array.isArray(data) ? data : (data.sessions ?? [])
}
