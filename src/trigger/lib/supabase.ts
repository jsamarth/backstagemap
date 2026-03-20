import { createClient } from '@supabase/supabase-js'

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key)
}

export const STORAGE_BUCKET = process.env.SCRAPE_STORAGE_BUCKET ?? 'html-scrapes'
