import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const neighborhood of NEIGHBORHOODS) {
    for (const query of QUERIES) {
      // Rate limiting: respect Places API 10 QPS quota
      await new Promise(r => setTimeout(r, 200))

      try {
        const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
        url.searchParams.set('query', `${query} in ${neighborhood.label}, NYC`)
        url.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY!)

        const res = await fetch(url.toString())
        const data = await res.json()

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ''}`)
        }

        for (const place of data.results ?? []) {
          // Dedup: skip if google_maps_venue_id already exists
          const { data: existing } = await supabase
            .from('venues')
            .select('id')
            .eq('google_maps_venue_id', place.place_id)
            .maybeSingle()

          if (existing) {
            skipped++
            continue
          }

          const websiteUrl: string | null = place.website ?? null

          const { error } = await supabase.from('venues').insert({
            name:                 place.name,
            address:              place.formatted_address,
            neighborhood:         neighborhood.value as any,
            venue_type:           'bar' as any,
            latitude:             place.geometry.location.lat,
            longitude:            place.geometry.location.lng,
            google_maps_venue_id: place.place_id,
            website_url:          websiteUrl,
            scrape_status:        'not_started' as any,
          })

          if (error) {
            errors++
            await supabase.from('scrape_logs').insert({
              workflow: 'discovery',
              status:   'failure',
              error:    error.message,
            })
          } else {
            inserted++
            await supabase.from('scrape_logs').insert({
              workflow: 'discovery',
              status:   'success',
            })
          }
        }
      } catch (err: any) {
        errors++
        await supabase.from('scrape_logs').insert({
          workflow: 'discovery',
          status:   'failure',
          error:    err.message,
        })
      }
    }
  }

  return NextResponse.json({ inserted, skipped, errors })
}
