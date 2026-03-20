/**
 * batch-pipeline.ts
 *
 * Runs the full scraping pipeline locally for multiple venues at once.
 * Venues are selected balanced across neighborhoods and shuffled.
 *
 * Usage:
 *   bun run scripts/batch-pipeline.ts [--limit <n>] [--include-scraped] [--save] [--provider apify|firecrawl]
 *
 * Options:
 *   --limit <n>         Number of venues to process (default: 5)
 *   --include-scraped   Include venues already extracted (default: only not_started)
 *   --save              Persist results to Supabase + storage (default: dry run)
 *   --provider <p>      Force crawl provider: apify | firecrawl (default: auto)
 */

import { createClient } from '@supabase/supabase-js'
import { resolve } from 'path'
import { SUPABASE_URL, SUPABASE_KEY } from './_env'
import { getArg, hasFlag, log, section } from './_utils'

// ── Args ──────────────────────────────────────────────────────────────────────

const limitArg      = getArg('--limit')
const LIMIT         = limitArg ? parseInt(limitArg, 10) : 5
const INCLUDE_SCRAPED = hasFlag('--include-scraped')
const SAVE          = hasFlag('--save')
const providerArg   = getArg('--provider')

// ── Neighborhood-balanced venue fetch ─────────────────────────────────────────

const NEIGHBORHOODS = [
  'williamsburg', 'bushwick', 'bed_stuy', 'east_village',
  'west_village', 'chelsea', 'greenpoint',
] as const

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

log('info', `batch-pipeline — limit=${LIMIT} include-scraped=${INCLUDE_SCRAPED} save=${SAVE} provider=${providerArg ?? 'auto'}`)
if (!SAVE) log('warn', 'DRY RUN — pass --save to persist results to Supabase')

const statuses = INCLUDE_SCRAPED ? ['not_started', 'extracted'] : ['not_started']
const perNeighborhood = Math.ceil(LIMIT / NEIGHBORHOODS.length)

const batches = await Promise.all(
  NEIGHBORHOODS.map(async (neighborhood) => {
    const { data } = await supabase
      .from('venues')
      .select('id, name, website_url')
      .in('scrape_status', statuses)
      .eq('neighborhood', neighborhood)
      .order('last_scraped_at', { ascending: true, nullsFirst: true })
      .limit(perNeighborhood)
    return data ?? []
  })
)

const venues = shuffle(batches.flat()).slice(0, LIMIT)

if (venues.length === 0) {
  log('warn', `No venues found with scrape_status in [${statuses.join(', ')}]`)
  process.exit(0)
}

log('ok', `Selected ${venues.length} venue${venues.length === 1 ? '' : 's'} to process`)

// ── Run pipeline for each venue ───────────────────────────────────────────────

const SCRIPTS_DIR = resolve(import.meta.dir)
let succeeded = 0
let failed = 0

for (let i = 0; i < venues.length; i++) {
  const venue = venues[i]
  section(`[${i + 1}/${venues.length}] ${venue.name ?? venue.id}`)
  log('info', `venue_id: ${venue.id}`)
  log('info', `url:      ${venue.website_url ?? '(none)'}`)

  if (!venue.website_url) {
    log('error', 'No website_url — skipping')
    failed++
    continue
  }

  const args = ['--venue-id', venue.id]
  if (SAVE) args.push('--save')
  if (providerArg) args.push('--provider', providerArg)

  const proc = Bun.spawn(
    ['bun', 'run', `${SCRIPTS_DIR}/run-pipeline.ts`, ...args],
    { stdio: ['inherit', 'inherit', 'inherit'] }
  )
  const exitCode = await proc.exited

  if (exitCode === 0) {
    log('ok', 'Pipeline succeeded')
    succeeded++
  } else {
    log('error', `Pipeline exited with code ${exitCode}`)
    failed++
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

section('SUMMARY')
log('ok', `Venues:    ${venues.length}`)
log('ok', `Succeeded: ${succeeded}`)
if (failed > 0) log('error', `Failed:    ${failed}`)
log(SAVE ? 'ok' : 'warn', SAVE ? 'Results persisted to Supabase.' : 'DRY RUN complete — re-run with --save to persist.')
