import { describe, expect, it } from 'vitest'
import { formatSessionDate, parseSessionDate, readableDate } from './date'

describe('session date formatting', () => {
  it('parses date-only values as a stable local calendar date', () => {
    const parsed = parseSessionDate('2026-07-20')

    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(6)
    expect(parsed?.getDate()).toBe(20)
    expect(formatSessionDate('2026-07-20', { month: 'short', day: 'numeric' }, 'en-US')).toBe('Jul 20')
    expect(readableDate('2026-07-20')).not.toContain('Invalid')
  })

  it('parses complete timestamps without appending another time or losing the timezone', () => {
    const value = '2026-07-20T23:30:00-04:00'

    expect(parseSessionDate(value)?.toISOString()).toBe('2026-07-21T03:30:00.000Z')
    expect(formatSessionDate(value, { month: 'short', day: 'numeric', timeZone: 'UTC' }, 'en-US')).toBe('Jul 21')
  })

  it('returns the source value when a date is invalid', () => {
    expect(parseSessionDate('not-a-date')).toBeNull()
    expect(parseSessionDate('2026-02-31')).toBeNull()
    expect(formatSessionDate('not-a-date', { month: 'short' }, 'en-US')).toBe('not-a-date')
  })
})
