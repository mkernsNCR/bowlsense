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

export function parseCalendarDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`)
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
