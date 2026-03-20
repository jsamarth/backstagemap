import { task, schedules } from '@trigger.dev/sdk'
import { createClient } from '@supabase/supabase-js'
import type { DiscoveryPayload, DiscoveryOutput } from './lib/types'
import { ScrapeWorkflow } from './lib/types'

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

async function fetchWebsite(placeId: string, apiKey: string): Promise<string | null> {
  await new Promise(r => setTimeout(r, 100))
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'website')
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString())
  const data = await res.json()
  return data.result?.website ?? null
}

async function runDiscovery(payload: DiscoveryPayload): Promise<DiscoveryOutput> {
  const limit = payload.limit ?? Infinity
  const force = payload.force ?? false

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const googleKey   = process.env.GOOGLE_MAPS_API_KEY

  if (!supabaseUrl) throw new Error('SUPABASE_URL is not set')
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  if (!googleKey)   throw new Error('GOOGLE_MAPS_API_KEY is not set')

  const supabase = createClient(supabaseUrl, supabaseKey)

  let inserted = 0
  let skipped  = 0
  let errors   = 0

  console.log(`[venue-discovery] START neighborhoods=${NEIGHBORHOODS.length} queries=${QUERIES.length} limit=${isFinite(limit) ? limit : 'none'} force=${force}`)

  outer:
  for (const neighborhood of NEIGHBORHOODS) {
    for (const query of QUERIES) {
      await new Promise(r => setTimeout(r, 200))
      console.log(`[venue-discovery] → [${neighborhood.label}] "${query}" ...`)

      try {
        const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
        searchUrl.searchParams.set('query', `${query} in ${neighborhood.label}, NYC`)
        searchUrl.searchParams.set('key', googleKey)

        const res  = await fetch(searchUrl.toString())
        const data = await res.json()

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ''}`)
        }

        const results = data.results ?? []
        console.log(`[venue-discovery]   got ${results.length} results`)

        for (const place of results) {
          const { data: existing } = await supabase
            .from('venues')
            .select('id')
            .eq('google_maps_venue_id', place.place_id)
            .maybeSingle()

          if (existing && !force) {
            skipped++
            continue
          }

          const websiteUrl = await fetchWebsite(place.place_id, googleKey)

          const { error } = await supabase.from('venues').upsert({
            name:                 place.name,
            address:              place.formatted_address,
            neighborhood:         neighborhood.value as string,
            venue_type:           'bar' as string,
            latitude:             place.geometry.location.lat,
            longitude:            place.geometry.location.lng,
            google_maps_venue_id: place.place_id,
            website_url:          websiteUrl,
            scrape_status:        'not_started' as string,
          }, { onConflict: 'google_maps_venue_id' })

          if (error) {
            console.error(`[venue-discovery] failed to insert "${place.name}": ${error.message}`)
            errors++
            await supabase.from('scrape_logs').insert({
              workflow: ScrapeWorkflow.VENUE_DISCOVERY,
              status:   'failure',
              error:    error.message,
            })
          } else {
            console.log(`[venue-discovery] ${existing ? 'updated' : 'inserted'} "${place.name}" website=${websiteUrl ?? '(none)'}`)
            inserted++
            await supabase.from('scrape_logs').insert({
              workflow: ScrapeWorkflow.VENUE_DISCOVERY,
              status:   'success',
            })

            if (inserted >= limit) {
              console.log(`[venue-discovery] limit of ${limit} reached — stopping early`)
              break outer
            }
          }
        }
      } catch (err: unknown) {
        const errMsg = (err as Error).message
        console.error(`[venue-discovery] API call failed: ${errMsg}`)
        errors++
        await supabase.from('scrape_logs').insert({
          workflow: ScrapeWorkflow.VENUE_DISCOVERY,
          status:   'failure',
          error:    errMsg,
        })
        break outer
      }
    }
  }

  console.log(`[venue-discovery] DONE inserted=${inserted} skipped=${skipped} errors=${errors}`)
  return { inserted, skipped, errors }
}

// Weekly schedule: Mondays 10:00 UTC
export const scheduledVenueDiscovery = schedules.task({
  id: 'scheduled-venue-discovery',
  cron: '0 10 * * 1',
  retry: { maxAttempts: 1 },
  run: async () => runDiscovery({}),
})

// Manual trigger: tasks.trigger('manual-venue-discovery', { limit: 50, force: false })
export const manualVenueDiscovery = task({
  id: 'manual-venue-discovery',
  run: async (payload: DiscoveryPayload) => runDiscovery(payload),
})
