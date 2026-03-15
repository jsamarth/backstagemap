import { SUPABASE_URL, SUPABASE_KEY } from './_env'
import { crawlToMarkdown } from '../api/_crawl'
import { createClient } from '@supabase/supabase-js'

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const venueId  = getArg('--venue-id')
const providerArg = getArg('--provider') as 'apify' | 'firecrawl' | undefined

if (!venueId) {
  console.error('Usage: bun run scrape:debug-scrape -- --venue-id <uuid> [--provider apify|firecrawl]')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const { data: venue, error } = await supabase
  .from('venues')
  .select('id, name, website_url')
  .eq('id', venueId)
  .single()

if (error || !venue) {
  console.error(`Venue not found: ${venueId}`)
  process.exit(1)
}

if (!venue.website_url) {
  console.error(`Venue "${venue.name}" has no website_url`)
  process.exit(1)
}

console.log(`Scraping "${venue.name}" — ${venue.website_url}`)
console.log('(dry-run: nothing will be saved)\n')

const { markdown, provider } = await crawlToMarkdown(venue.website_url, providerArg)

console.log(`\n--- RESULT ---`)
console.log(`provider : ${provider}`)
console.log(`bytes    : ${markdown.length}`)
console.log(`\n--- MARKDOWN ---\n`)
console.log(markdown)
