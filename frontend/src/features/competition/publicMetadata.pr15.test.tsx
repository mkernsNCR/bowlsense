import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePublicMetadata } from './publicMetadata'

function Harness(props: { title: string; description: string; imageUrl?: string }) {
  usePublicMetadata(props)
  return null
}

function addMeta(attribute: 'name' | 'property', key: string, content?: string) {
  const element = document.createElement('meta')
  element.setAttribute(attribute, key)
  if (content !== undefined) element.setAttribute('content', content)
  document.head.appendChild(element)
  return element
}

function meta(attribute: 'name' | 'property', key: string) {
  return document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
}

beforeEach(() => {
  document.head.querySelectorAll('meta[name^="twitter:"], meta[property^="og:"]').forEach((element) => element.remove())
  document.title = 'BowlSense'
  window.history.replaceState({}, '', '/score/42')
})

afterEach(() => {
  cleanup()
})

describe('usePublicMetadata lifecycle', () => {
  it('publishes absolute Open Graph and Twitter image URLs', () => {
    render(<Harness title="A 247 game" description="Purple Lanes" imageUrl="/api/games/42/og-image" />)

    expect(document.title).toBe('A 247 game')
    expect(meta('property', 'og:url')?.content).toBe(`${window.location.origin}/score/42`)
    expect(meta('property', 'og:image')?.content).toBe(`${window.location.origin}/api/games/42/og-image`)
    expect(meta('name', 'twitter:image')?.content).toBe(`${window.location.origin}/api/games/42/og-image`)
    expect(meta('name', 'twitter:title')?.content).toBe('A 247 game')
    expect(meta('name', 'twitter:card')?.content).toBe('summary_large_image')
  })

  it('explicitly removes stale image metadata when a result has no image', () => {
    addMeta('property', 'og:image', 'https://stale.example/card.png')
    addMeta('property', 'og:image:width', '1200')
    addMeta('property', 'og:image:height', '630')
    addMeta('name', 'twitter:image', 'https://stale.example/card.png')

    render(<Harness title="Unavailable result" description="Not found" />)

    expect(meta('property', 'og:image')).toBeNull()
    expect(meta('property', 'og:image:width')).toBeNull()
    expect(meta('property', 'og:image:height')).toBeNull()
    expect(meta('name', 'twitter:image')).toBeNull()
    expect(meta('name', 'twitter:card')?.content).toBe('summary')
  })

  it('restores pre-rendered tags and removes hook-created tags on cleanup', () => {
    const originalTitle = addMeta('property', 'og:title', 'Server-rendered title')
    const originalImage = addMeta('property', 'og:image', 'https://bowlsense.example/server-card.png')
    const originalTwitterCard = addMeta('name', 'twitter:card', 'summary_large_image')
    document.title = 'Server-rendered title'

    const view = render(<Harness title="Hydrated title" description="Hydrated description" />)
    expect(originalTitle.content).toBe('Hydrated title')
    expect(originalImage.isConnected).toBe(false)

    view.unmount()

    expect(document.title).toBe('Server-rendered title')
    expect(originalTitle.content).toBe('Server-rendered title')
    expect(originalImage.isConnected).toBe(true)
    expect(originalImage.content).toBe('https://bowlsense.example/server-card.png')
    expect(originalTwitterCard.content).toBe('summary_large_image')
    expect(meta('property', 'og:description')).toBeNull()
    expect(meta('name', 'twitter:title')).toBeNull()
  })
})
