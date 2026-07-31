interface TrendGame {
  id: number
  score: number
  date: string
  location: string
  gameNumber: number
}

export interface TrendData {
  games: TrendGame[]
  rolling5: number[]
  rolling10: number[]
  rolling20: number[]
}

export const TREND_WINDOWS = [
  { size: 5, dataKey: 'rolling5', tone: 'five' },
  { size: 10, dataKey: 'rolling10', tone: 'ten' },
  { size: 20, dataKey: 'rolling20', tone: 'twenty' },
] as const

export type TrendWindow = typeof TREND_WINDOWS[number]['size']

export function trendWindowConfig(windowSize: TrendWindow) {
  return TREND_WINDOWS.find((window) => window.size === windowSize) ?? TREND_WINDOWS[1]
}
