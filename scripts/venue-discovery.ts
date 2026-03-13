import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, GOOGLE_MAPS_KEY } from './_env'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function log(level: 'info' | 'ok' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString()
  const prefix = { info: '·', ok: '✓', warn: '⚠', error: '✗' }[level]
  console.log(`[${ts}] ${prefix} ${msg}`)
}

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

const limitArg = getArg('--limit')
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity
const FORCE = process.argv.includes('--force')

let inserted = 0
let skipped = 0
let errors = 0

log('info', `Starting venue-discovery — ${NEIGHBORHOODS.length} neighborhoods × ${QUERIES.length} queries = ${NEIGHBORHOODS.length * QUERIES.length} API calls planned`)
if (isFinite(LIMIT)) log('info', `Limit set to ${LIMIT} inserts`)
if (FORCE) log('warn', `--force enabled — existing venues will be updated`)

outer:
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

      const results = data.results ?? []
      log('info', `  Got ${results.length} results`)

      for (const place of results) {
        const { data: existing } = await supabase
          .from('venues')
          .select('id')
          .eq('google_maps_venue_id', place.place_id)
          .maybeSingle()

        if (existing && !FORCE) {
          log('info', `  · "${place.name}" — already exists, skipping`)
          skipped++
          continue
        }

        log('info', `  · Fetching details for "${place.name}" ...`)
        const websiteUrl = await fetchWebsite(place.place_id)
        log('info', `    website: ${websiteUrl ?? '(none)'}`)

        const { error } = await supabase.from('venues').upsert({
          name:                 place.name,
          address:              place.formatted_address,
          neighborhood:         neighborhood.value as any,
          venue_type:           'bar' as any,
          latitude:             place.geometry.location.lat,
          longitude:            place.geometry.location.lng,
          google_maps_venue_id: place.place_id,
          website_url:          websiteUrl,
          scrape_status:        'not_started' as any,
        }, { onConflict: 'google_maps_venue_id' })

        if (error) {
          log('error', `  ✗ Failed to insert "${place.name}": ${error.message}`)
          errors++
          await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'failure', error: error.message })
        } else {
          log('ok', `  ${existing ? 'Updated' : 'Inserted'} "${place.name}"`)
          inserted++
          await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'success' })

          if (inserted >= LIMIT) {
            log('warn', `Limit of ${LIMIT} reached — stopping early`)
            break outer
          }
        }
      }
    } catch (err: any) {
      log('error', `API call failed: ${err.message}`)
      log('error', `Stopping early due to error.`)
      errors++
      await supabase.from('scrape_logs').insert({ workflow: 'discovery', status: 'failure', error: err.message })
      break outer
    }
  }
}

log('ok', `Done. inserted=${inserted} skipped=${skipped} errors=${errors}`)
