export interface TonightLeague {
  id: number
  name: string
  location: string | null
  season: string | null
  gamesPerWeek: number
  startDate: string | null
  endDate: string | null
  todayName: string
  todayIso: string
  inSeason: boolean
  nextWeekNumber: number
  lastOpponent: string | null
  lastWeekDate: string | null
  stats: {
    average: number
    high: number
    totalGames: number
    totalWeeks: number
    gamesWon: number
    gamesLost: number
  }
}

export interface Stats {
  average: number
  strikeRate: number
  spareRate: number
  totalGames: number
  totalScore?: number
  totalStrikes?: number
  totalSpares?: number
}

export interface WeeklyStats {
  thisWeek: { games: number; average: number; highGame: number }
  lastWeek: { games: number; average: number; highGame: number }
  delta: { average: number | null; games: number; highGame: number }
  dayOfWeek: string
}

export interface Session {
  id: number
  date: string
  location: string
  lanes: string
  notes: string
  gameCount?: number
  avgScore?: number
  highScore?: number
  perfectGames?: number
}

export interface Game {
  id: number
  score: number
  gameNumber?: number
  game_number?: number
  frameData?: string | null
  frame_data?: string | null
  sessionId?: number
  session_id?: number
  date?: string
  location?: string
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
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return response.json() as Promise<T>
}
