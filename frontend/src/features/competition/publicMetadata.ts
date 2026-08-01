import { useEffect } from 'react'

type MetaAttribute = 'name' | 'property'

interface MetaDescriptor {
  attribute: MetaAttribute
  key: string
  content?: string
}

interface MetaSnapshot {
  descriptor: MetaDescriptor
  element: HTMLMetaElement | null
  existed: boolean
  content: string | null
}

function absoluteUrl(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value, window.location.href).href
  } catch {
    return undefined
  }
}

function captureMeta(descriptor: MetaDescriptor): MetaSnapshot {
  const selector = `meta[${descriptor.attribute}="${descriptor.key}"]`
  const element = document.head.querySelector<HTMLMetaElement>(selector)
  return {
    descriptor,
    element,
    existed: element !== null,
    content: element?.getAttribute('content') ?? null,
  }
}

function applyMeta(snapshot: MetaSnapshot) {
  const { descriptor } = snapshot
  if (descriptor.content == null) {
    snapshot.element?.remove()
    return
  }

  let element = snapshot.element
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(descriptor.attribute, descriptor.key)
    document.head.appendChild(element)
    snapshot.element = element
  }
  element.setAttribute('content', descriptor.content)
}

function restoreMeta(snapshot: MetaSnapshot) {
  if (!snapshot.existed) {
    snapshot.element?.remove()
  } else if (snapshot.element) {
    if (!snapshot.element.isConnected) document.head.appendChild(snapshot.element)
    if (snapshot.content == null) snapshot.element.removeAttribute('content')
    else snapshot.element.setAttribute('content', snapshot.content)
  }
}

export function usePublicMetadata({ title, description, imageUrl }: { title: string; description: string; imageUrl?: string }) {
  useEffect(() => {
    const previousTitle = document.title
    const absoluteImageUrl = absoluteUrl(imageUrl)
    const descriptors: MetaDescriptor[] = [
      { attribute: 'property', key: 'og:title', content: title },
      { attribute: 'property', key: 'og:description', content: description },
      { attribute: 'property', key: 'og:type', content: 'website' },
      { attribute: 'property', key: 'og:url', content: window.location.href },
      { attribute: 'property', key: 'og:image', content: absoluteImageUrl },
      { attribute: 'property', key: 'og:image:width', content: absoluteImageUrl ? '1200' : undefined },
      { attribute: 'property', key: 'og:image:height', content: absoluteImageUrl ? '630' : undefined },
      { attribute: 'name', key: 'twitter:card', content: absoluteImageUrl ? 'summary_large_image' : 'summary' },
      { attribute: 'name', key: 'twitter:title', content: title },
      { attribute: 'name', key: 'twitter:description', content: description },
      { attribute: 'name', key: 'twitter:image', content: absoluteImageUrl },
    ]
    const snapshots = descriptors.map(captureMeta)

    document.title = title
    snapshots.forEach(applyMeta)

    return () => {
      document.title = previousTitle
      snapshots.forEach(restoreMeta)
    }
  }, [description, imageUrl, title])
}
