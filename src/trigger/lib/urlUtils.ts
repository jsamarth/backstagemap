export function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u)
    return parsed.hostname.toLowerCase() + parsed.pathname.replace(/\/+$/, '')
  } catch {
    return u
  }
}

export function resolveSubUrls(rawUrls: string[], sourceUrl: string): string[] {
  const sourceNorm = normalizeUrl(sourceUrl)
  const seen = new Set<string>()
  return rawUrls
    .map(path => {
      try { return new URL(path, sourceUrl).toString() }
      catch { return null }
    })
    .filter((u): u is string => u !== null)
    .filter(u => {
      const norm = normalizeUrl(u)
      if (norm === sourceNorm) return false
      if (seen.has(norm)) return false
      seen.add(norm)
      return true
    })
}
