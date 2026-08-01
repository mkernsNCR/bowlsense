import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Sheet } from './Sheet'

afterEach(cleanup)

function NestedSheets() {
  const [nestedOpen, setNestedOpen] = useState(false)

  return (
    <Sheet open onClose={vi.fn()} title="Outer sheet">
      <button type="button" onClick={() => setNestedOpen(true)}>Open nested sheet</button>
      <Sheet open={nestedOpen} onClose={() => setNestedOpen(false)} title="Nested sheet">
        <button type="button" onClick={() => setNestedOpen(false)}>Close nested sheet</button>
      </Sheet>
    </Sheet>
  )
}

describe('Sheet accessibility stack', () => {
  it('hides and disables an underlying dialog while a nested sheet is open', () => {
    render(<NestedSheets />)
    const outer = screen.getByRole('dialog', { name: 'Outer sheet' })

    fireEvent.click(screen.getByRole('button', { name: 'Open nested sheet' }))

    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    const nested = screen.getByRole('dialog', { name: 'Nested sheet' })
    expect(dialogs).toHaveLength(2)
    expect(outer.getAttribute('aria-hidden')).toBe('true')
    expect(outer.hasAttribute('inert')).toBe(true)
    expect(nested.hasAttribute('aria-hidden')).toBe(false)
    expect(nested.hasAttribute('inert')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close nested sheet' }))

    expect(outer.hasAttribute('aria-hidden')).toBe(false)
    expect(outer.hasAttribute('inert')).toBe(false)
  })
})
