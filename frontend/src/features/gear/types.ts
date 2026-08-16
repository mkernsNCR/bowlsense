export interface GearBall {
  id: number
  name: string
  brand: string | null
  color?: string | null
  notes?: string | null
  bowwwlId?: string | null
  coreType?: string | null
  coreRg?: string | number | null
  coreDiff?: string | number | null
  coverstockName?: string | null
  coverstockType?: string | null
  factoryFinish?: string | null
  thumbnailImage?: string | null
  createdAt?: string | null
}

export function missingBallSpecs(ball: Pick<GearBall, 'coverstockType' | 'coreType' | 'coreRg'>): string[] {
  return [
    !ball.coverstockType ? 'cover type' : null,
    !ball.coreType ? 'core type' : null,
    ball.coreRg === null || ball.coreRg === undefined || ball.coreRg === '' ? 'RG' : null,
  ].filter((field): field is string => Boolean(field))
}

export type ArsenalUseCase = 'League' | 'Tournament' | 'Practice' | 'Sport Shot' | 'Custom'

export interface Arsenal {
  id: number
  name: string
  description: string | null
  useCase: ArsenalUseCase | null
  maxSize: number
  notes: string | null
  ballCount?: number
  ballIds?: number[]
}

export interface ArsenalBall {
  id: number
  ballId: number
  role: string | null
  slotOrder: number
  notes: string | null
  ball: GearBall
}

export interface ArsenalStats {
  gamesPlayed: number
  averageScore: number
  highGame: number
  byBall: Array<{ ballId: number; ballName: string; role: string | null; gamesPlayed: number; averageScore: number; highGame: number }>
  byUseCase: {
    open: { games: number; average: number }
    league: { games: number; average: number }
    tournament: { games: number; average: number }
  }
}

export interface ArsenalDetail extends Arsenal {
  balls: ArsenalBall[]
  stats?: ArsenalStats
}
