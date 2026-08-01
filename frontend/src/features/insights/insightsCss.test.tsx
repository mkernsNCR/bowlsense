import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/features/insights/insights.css', 'utf8')

describe('insights CSS accessibility policy', () => {
  it('uses the contrast-safe on-accent token for takeaway copy', () => {
    expect(css).toMatch(/\.insights-takeaway \.insights-kicker\s*{[^}]*color:\s*var\(--insights-on-accent\)/s)
    expect(css).toMatch(/\.insights-takeaway-detail\s*{[^}]*color:\s*var\(--insights-on-accent\)/s)
  })

  it('keeps fixed insight label sizes at 12px or larger', () => {
    const fixedSizes = [...css.matchAll(/font-size:\s*([0-9.]+)(px|rem)\s*;/g)]

    expect(fixedSizes.length).toBeGreaterThan(0)
    for (const [, rawSize, unit] of fixedSizes) {
      const pixels = Number(rawSize) * (unit === 'rem' ? 16 : 1)
      expect(pixels, `font-size: ${rawSize}${unit}`).toBeGreaterThanOrEqual(12)
    }
  })
})
