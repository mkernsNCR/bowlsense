import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from './localDraft'

function isName(value: unknown): value is { name: string } {
  return Boolean(value) && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string'
}

beforeEach(() => {
  localStorage.clear()
})

describe('local draft storage', () => {
  it('returns a valid draft only for the server baseline it was created from', () => {
    expect(writeLocalDraft('league:1:game:2', 'server-v1', { name: 'saved locally' })).toBe(true)

    expect(readLocalDraft('league:1:game:2', 'server-v1', isName)?.value).toEqual({ name: 'saved locally' })
    expect(readLocalDraft('league:1:game:2', 'server-v2', isName)).toBeNull()
  })

  it('removes a draft without affecting other scopes', () => {
    writeLocalDraft('game:1', null, { name: 'one' })
    writeLocalDraft('game:2', null, { name: 'two' })

    expect(clearLocalDraft('game:1')).toBe(true)
    expect(readLocalDraft('game:1', null, isName)).toBeNull()
    expect(readLocalDraft('game:2', null, isName)?.value.name).toBe('two')
  })
})
