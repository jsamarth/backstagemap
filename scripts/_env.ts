// Shared env validation for scrape scripts.
// Tries both VITE_ and NEXT_PUBLIC_ naming conventions.

function require(name: string, ...aliases: string[]): string {
  for (const key of [name, ...aliases]) {
    const val = process.env[key]
    if (val) return val
  }
  const all = [name, ...aliases].join(' / ')
  console.error(`[env] Missing required env var: ${all}`)
  console.error(`[env] Add it to .env.local and re-run.`)
  process.exit(1)
}

export const SUPABASE_URL      = require('NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL')
export const SUPABASE_KEY      = require('SUPABASE_SERVICE_ROLE_KEY')
export const STORAGE_BUCKET    = process.env.SCRAPE_STORAGE_BUCKET ?? 'html-scrapes'
export const GOOGLE_MAPS_KEY   = process.env.GOOGLE_MAPS_API_KEY
export const FIRECRAWL_KEY     = process.env.FIRECRAWL_API_KEY
export const OPENAI_KEY        = process.env.OPENAI_API_KEY
export const APIFY_KEY         = process.env.APIFY_API_KEY
