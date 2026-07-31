export interface ScoringProgress {
  recordedRolls: number
  savedAsideRolls?: number
}

export function requiresDiscardConfirmation({ recordedRolls, savedAsideRolls = 0 }: ScoringProgress) {
  return recordedRolls > 0 || savedAsideRolls > 0
}
