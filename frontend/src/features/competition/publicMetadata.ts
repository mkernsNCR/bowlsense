import { useEffect } from 'react'

export function usePublicMetadata({ title, description, imageUrl }: { title: string; description: string; imageUrl?: string }) {
  useEffect(() => {
    document.title = title
    const setMeta = (property: string, content: string, attr: 'property' | 'name' = 'property') => {
      let element = document.querySelector(`meta[${attr}="${property}"]`) as HTMLMetaElement | null
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attr, property)
        document.head.appendChild(element)
      }
      element.content = content
    }
    setMeta('og:title', title)
    setMeta('og:description', description)
    if (imageUrl) setMeta('og:image', imageUrl)
    setMeta('og:image:width', '1200')
    setMeta('og:image:height', '630')
    setMeta('twitter:card', 'summary_large_image')
  }, [description, imageUrl, title])
}
