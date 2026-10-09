import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createImageResolver } from '../lib/imageUrls'

// Felles løser for hele appen, så samme bilde ikke signeres flere ganger
export const resolveImageUrl = createImageResolver(supabase)

// <img> for bilder lagret i Storage: viser en tidsbegrenset (signert) URL i stedet for den offentlige.
// fallback vises mens URL-en hentes (samme plass som bildet, så layouten ikke hopper).
export default function StoredImage({ src, alt = '', fallback = null, ...props }) {
  const [url, setUrl] = useState(() => resolveImageUrl.peek(src))
  useEffect(() => {
    let alive = true
    setUrl(resolveImageUrl.peek(src))
    resolveImageUrl(src).then(u => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [src])
  if (!url) return fallback
  return <img src={url} alt={alt} {...props} />
}
