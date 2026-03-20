import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, GOOGLE_MAPS_KEY } from './_env'
import { getArg, log } from './_utils'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const NEIGHBORHOODS = [
  { label: 'Williamsburg', value: 'williamsburg' },
  { label: 'Bushwick',     value: 'bushwick' },
  { label: 'Bed-Stuy',     value: 'bed_stuy' },
  { label: 'East Village', value: 'east_village' },
  { label: 'West Village', value: 'west_village' },
  { label: 'Chelsea',      value: 'chelsea' },
  { label: 'Greenpoint',   value: 'greenpoint' },
]

const QUERIES = [
  'live music bar',
  'music venue',
  'jazz bar',
  'rock bar',
  'dj bar',
]

type PlaceResult = {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  neighborhood: string
}

async function fetchWebsite(placeId: string): Promise<string | null> {
  await new Promise(r => setTimeout(r, 100))
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'website')
  url.searchParams.set('key', GOOGLE_MAPS_KEY!)
  const res = await fetch(url.toString())
  const data = await res.json()
  return data.result?.website ?? null
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const limitArg = getArg('--limit')
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity
const FORCE = process.argv.includes('--force')

log('info', `Starting venue-discovery — ${NEIGHBORHOODS.length} neighborhoods × ${QUERIES.length} queries = ${NEIGHBORHOODS.length * QUERIES.length} API calls`)
if (isFinite(LIMIT)) log('info', `Limit set to ${LIMIT} inserts`)
if (FORCE) log('warn', `--force enabled — existing venues will be updated`)

// ── Phase 1: Collect all candidates from Google Maps ─────────────────────────
// Fetch all text search results across every neighborhood × query combination,
// deduplicating by place_id. No DB writes happen here.

const seen = new Set<string>()
const candidates: PlaceResult[] = []
let apiErrors = 0

for (const neighborhood of NEIGHBORHOODS) {
  for (const query of QUERIES) {
    await new Promise(r => setTimeout(r, 200))
    log('info', `→ [${neighborhood.label}] "${query}" ...`)

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
      url.searchParams.set('query', `${query} in ${neighborhood.label}, NYC`)
      url.searchParams.set('key', GOOGLE_MAPS_KEY!)

      const res = await fetch(url.toString())
      const data = await res.json()

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ''}`)
      }

      const results: PlaceResult[] = data.results ?? []
      let newCount = 0
      for (const place of results) {
        if (!seen.has(place.place_id)) {
          seen.add(place.place_id)
          candidates.push({ ...place, neighborhood: neighborhood.value })
          newCount++
        }
      }
      log('info', `  Got ${results.length} results (${newCount} new, ${results.length - newCount} duplicate)`)
    } catch (err: unknown) {
      log('error', `  API call failed: ${(err as Error).message}`)
      await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'failure', error: (err as Error).message })
      apiErrors++
    }
  }
}

log('info', `Collected ${candidates.length} unique candidates across all neighborhoods`)

// ── Phase 2: Shuffle and upsert up to LIMIT ───────────────────────────────────
// Shuffle so no single neighborhood dominates regardless of LIMIT.

const shuffled = shuffle(candidates)

let inserted = 0
let skipped = 0
let errors = 0

for (const place of shuffled) {
  if (inserted >= LIMIT) {
    log('warn', `Limit of ${LIMIT} reached — stopping`)
    break
  }

  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .eq('google_maps_venue_id', place.place_id)
    .maybeSingle()

  if (existing && !FORCE) {
    log('info', `· "${place.name}" [${place.neighborhood}] — already exists, skipping`)
    skipped++
    continue
  }

  log('info', `· Fetching details for "${place.name}" [${place.neighborhood}] ...`)
  const websiteUrl = await fetchWebsite(place.place_id)
  log('info', `  website: ${websiteUrl ?? '(none)'}`)

  const { error } = await supabase.from('venues').upsert({
    name:                 place.name,
    address:              place.formatted_address,
    neighborhood:         place.neighborhood as string,
    venue_type:           'bar' as string,
    latitude:             place.geometry.location.lat,
    longitude:            place.geometry.location.lng,
    google_maps_venue_id: place.place_id,
    website_url:          websiteUrl,
    scrape_status:        'not_started' as string,
  }, { onConflict: 'google_maps_venue_id' })

  if (error) {
    log('error', `  ✗ Failed to insert "${place.name}": ${error.message}`)
    errors++
    await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'failure', error: error.message })
  } else {
    log('ok', `  ${existing ? 'Updated' : 'Inserted'} "${place.name}" [${place.neighborhood}]`)
    inserted++
    await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'success' })
  }
}

log('ok', `Done. inserted=${inserted} skipped=${skipped} errors=${errors} api_errors=${apiErrors}`)
