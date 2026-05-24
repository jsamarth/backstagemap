import { task } from '@trigger.dev/sdk'
import { getSupabaseClient } from '@/trigger/lib/supabase'
import { getNeighborhoodFromCoords } from '@/trigger/lib/geo'

const BATCH_SIZE = 50

export const backfillNeighborhoods = task({
  id: 'backfill-neighborhoods',
  retry: { maxAttempts: 1 },
  run: async () => {
    const supabase = getSupabaseClient()
    let offset = 0
    let updated = 0
    let nulled = 0

    while (true) {
      const { data: venues, error } = await supabase
        .from('venues')
        .select('id, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) throw error
      if (!venues || venues.length === 0) break

      for (const venue of venues) {
        const neighborhood = getNeighborhoodFromCoords(
          venue.latitude as number,
          venue.longitude as number,
        )

        await supabase
          .from('venues')
          .update({ neighborhood })
          .eq('id', venue.id)

        if (neighborhood) {
          updated++
          console.log(`[backfill] venue=${venue.id} → ${neighborhood}`)
        } else {
          nulled++
          console.warn(`[backfill] venue=${venue.id} → no polygon match (set to null)`)
        }
      }

      offset += BATCH_SIZE
      if (venues.length < BATCH_SIZE) break
    }

    console.log(`[backfill] DONE updated=${updated} nulled=${nulled}`)
    return { updated, nulled }
  },
})
