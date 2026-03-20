import { task, schedules } from '@trigger.dev/sdk'
import { getSupabaseClient } from './lib/supabase'
import { venueScrapePipeline } from './venueScrapePipeline'
import type { RunVenueScrapePayload, RunVenueScrapeOutput } from './lib/types'
import { ScrapeWorkflow } from './lib/types'

// Budget: 10 venues/day × 5 runs each (1 orchestrator + 4 tasks) × 30 days = 1,500
// + 30 scheduler runs/month = ~1,530 runs/month, well within 5,000/month limit.
async function runVenueScrape(payload: RunVenueScrapePayload): Promise<RunVenueScrapeOutput> {
  const limit = payload.limit ?? 10
  const supabase = getSupabaseClient()

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: venues } = await supabase
    .from('venues')
    .select('id, website_url')
    .or(`last_scraped_at.is.null,last_scraped_at.lte.${twoDaysAgo}`)
    .order('last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  const venueList = venues ?? []
  let processed = 0
  let skipped = 0

  for (const venue of venueList) {
    if (!venue.website_url) {
      console.warn(`[scheduled-venue-scrape] venueId=${venue.id} has no website_url — skipping`)
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: ScrapeWorkflow.SCHEDULED_SCRAPE,
        status:   'failure',
        error:    'No website_url',
      })
      skipped++
      continue
    }

    // Fire-and-forget: pipelines run in parallel, scheduler does not wait for results
    await venueScrapePipeline.trigger({ venueId: venue.id, websiteUrl: venue.website_url })
    console.log(`[scheduled-venue-scrape] triggered pipeline for venueId=${venue.id}`)
    processed++
  }

  console.log(`[scheduled-venue-scrape] DONE processed=${processed} skipped=${skipped}`)
  return { processed, skipped }
}

// Daily at 00:00 UTC
export const scheduledVenueScrape = schedules.task({
  id: 'scheduled-venue-scrape',
  cron: '0 0 * * *',
  retry: { maxAttempts: 1 },
  run: async () => runVenueScrape({ limit: 10 }),
})

// Manual trigger: tasks.trigger('manual-venue-scrape', { limit: 5 })
export const manualVenueScrape = task({
  id: 'manual-venue-scrape',
  retry: { maxAttempts: 1 },
  run: async (payload: RunVenueScrapePayload) => runVenueScrape({ limit: payload.limit ?? 10 }),
})
