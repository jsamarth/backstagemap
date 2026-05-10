import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, GOOGLE_MAPS_KEY } from './_env'
import { getArg, log } from './_utils'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const QUERIES = [
  'live music bar',
  'music venue',
  'jazz bar',
  'rock bar',
  'dj bar',
]

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'The Bronx', 'Staten Island']

type PlaceResult = {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
}

type PlaceDetails = { website: string | null; neighborhood: string | null }

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  await new Promise(r => setTimeout(r, 100))
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'website,address_components')
  url.searchParams.set('key', GOOGLE_MAPS_KEY!)
  const res  = await fetch(url.toString())
  const data = await res.json()

  const website: string | null = data.result?.website ?? null

  const components: { long_name: string; types: string[] }[] =
    data.result?.address_components ?? []
  const component =
    components.find(c => c.types.includes('neighborhood')) ??
    components.find(c => c.types.includes('sublocality_level_2'))

  const neighborhood = component
    ? component.long_name.toLowerCase().replace(/[\s\-]+/g, '_')
    : null

  if (!neighborhood) {
    const types = components.map(c => `${c.long_name} [${c.types.join(',')}]`).join(' | ')
    log('info', `  address_components: ${types || '(none)'}`)
  }

  return { website, neighborhood }
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

log('info', `Starting venue-discovery — ${QUERIES.length * BOROUGHS.length} queries across NYC (${BOROUGHS.length} boroughs × ${QUERIES.length} keywords)`)
if (isFinite(LIMIT)) log('info', `Limit set to ${LIMIT} inserts`)
if (FORCE) log('warn', `--force enabled — existing venues will be updated`)

// ── Phase 1: Collect all candidates from Google Maps ─────────────────────────

const seen = new Set<string>()
const candidates: PlaceResult[] = []
let apiErrors = 0

for (const borough of BOROUGHS) {
  for (const query of QUERIES) {
  await new Promise(r => setTimeout(r, 200))
  log('info', `→ "${query} in ${borough}, New York City" ...`)

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
    url.searchParams.set('query', `${query} in ${borough}, New York City`)
    url.searchParams.set('key', GOOGLE_MAPS_KEY!)

    const res  = await fetch(url.toString())
    const data = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ''}`)
    }

    const results: PlaceResult[] = data.results ?? []
    let newCount = 0
    for (const place of results) {
      if (!seen.has(place.place_id)) {
        seen.add(place.place_id)
        candidates.push(place)
        newCount++
      }
    }
    log('info', `  Got ${results.length} results (${newCount} new, ${results.length - newCount} duplicate)`)
  } catch (err: unknown) {
    log('error', `  API call failed: ${(err as Error).message}`)
    await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'failure', error: (err as Error).message })
    apiErrors++
  }
  } // end for query
} // end for borough

log('info', `Collected ${candidates.length} unique candidates`)

// ── Phase 2: Shuffle and upsert up to LIMIT ───────────────────────────────────

const shuffled = shuffle(candidates)

let inserted = 0
let skipped  = 0
let errors   = 0

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
    log('info', `· "${place.name}" — already exists, skipping`)
    skipped++
    continue
  }

  log('info', `· Fetching details for "${place.name}" ...`)
  const { website: websiteUrl, neighborhood } = await fetchPlaceDetails(place.place_id)

  log('info', `  neighborhood: ${neighborhood ?? '(none)'}  website: ${websiteUrl ?? '(none)'}`)

  const { error } = await supabase.from('venues').upsert({
    name:                 place.name,
    address:              place.formatted_address,
    neighborhood,
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
    log('ok', `  ${existing ? 'Updated' : 'Inserted'} "${place.name}" [${neighborhood}]`)
    inserted++
    await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'success' })
  }
}

log('ok', `Done. inserted=${inserted} skipped=${skipped} errors=${errors} api_errors=${apiErrors}`)
