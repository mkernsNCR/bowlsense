import { useState, useCallback } from 'react'

export interface Settings {
  name: string
  defaultBallId: string
  homeLanes: string
}

const KEY = 'bowlingSettings'
const defaults: Settings = { name: '', defaultBallId: '', homeLanes: '' }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return { ...defaults }
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(load)

  const setSettings = useCallback((next: Settings) => {
    localStorage.setItem(KEY, JSON.stringify(next))
    setSettingsState(next)
  }, [])

  return { settings, setSettings }
}
