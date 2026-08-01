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

export interface CreateSessionPayload {
  date: string
  location: string
  lanes: string
  notes?: string
}

export type CreateGamePayload = SavedGame & { sessionId: number }

interface CreatedRecord {
  id: number
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit, operationError?: string): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(operationError ?? `Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function createSessionRequest(payload: CreateSessionPayload) {
  return fetchJson<CreatedRecord>('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Session could not be created.')
}

export async function createGameRequest(payload: CreateGamePayload) {
  return fetchJson<CreatedRecord>('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'Game could not be saved.')
}

export async function fetchBalls() {
  return fetchJson<Ball[]>('/api/balls')
}

export async function fetchRecentSessions(limit = 100) {
  const data = await fetchJson<Session[] | { sessions?: Session[] }>(`/api/sessions?limit=${limit}&offset=0`)
  return Array.isArray(data) ? data : (data.sessions ?? [])
}
