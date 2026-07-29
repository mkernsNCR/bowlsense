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
  opponent: string | null
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

export interface TonightLeagueResponse extends Omit<TonightLeague, 'opponent'> {
  lastOpponent: string | null
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
  frameData?: string | null
  sessionId?: number
  date?: string
  location?: string
}

export interface GameResponse extends Game {
  game_number?: number
  frame_data?: string | null
  session_id?: number
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

export function normalizeGame(game: GameResponse): Game {
  return {
    id: game.id,
    score: game.score,
    gameNumber: game.gameNumber ?? game.game_number,
    frameData: game.frameData ?? game.frame_data ?? null,
    sessionId: game.sessionId ?? game.session_id,
    date: game.date,
    location: game.location,
  }
}

export function normalizeTonightLeague(league: TonightLeagueResponse): TonightLeague {
  const { lastOpponent, ...normalizedLeague } = league
  return { ...normalizedLeague, opponent: lastOpponent }
}
