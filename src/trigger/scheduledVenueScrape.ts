import { task, schedules } from '@trigger.dev/sdk'
import { getSupabaseClient } from './lib/supabase'
import { venueScrapePipeline } from './venueScrapePipeline'
import type { RunVenueScrapePayload, RunVenueScrapeOutput } from './lib/types'
import { ScrapeWorkflow } from './lib/types'

// Budget: 1 venue/run × 5 runs each (1 orchestrator + 4 tasks) × 48 runs/day × 30 days = 7,200
// + 1,440 scheduler runs/month = ~8,640 runs/month (within typical limits).
async function runVenueScrape(payload: RunVenueScrapePayload): Promise<RunVenueScrapeOutput> {
  const limit = payload.limit ?? 1
  const supabase = getSupabaseClient()

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: venues } = await supabase
    .from('venues')
    .select('id, website_url')
    .or(`last_scraped_at.is.null,last_scraped_at.lte.${twoDaysAgo}`)
    .not('scrape_status', 'in', '(no_events,failed)')
    .not('website_url', 'is', null)
    .not('website_url', 'ilike', '%facebook.com%')
    .order('last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  const venueList = venues ?? []
  let processed = 0
  let skipped = 0

  for (const venue of venueList) {
    // Fire-and-forget: pipelines run in parallel, scheduler does not wait for results
    await venueScrapePipeline.trigger({ venueId: venue.id, websiteUrl: venue.website_url! })
    console.log(`[scheduled-venue-scrape] triggered pipeline for venueId=${venue.id}`)
    processed++
  }

  console.log(`[scheduled-venue-scrape] DONE processed=${processed} skipped=${skipped}`)
  return { processed, skipped }
}

// Every 30 minutes
export const scheduledVenueScrape = schedules.task({
  id: 'scheduled-venue-scrape',
  cron: '*/30 * * * *',
  retry: { maxAttempts: 1 },
  run: async () => runVenueScrape({ limit: 1 }),
})

// Manual trigger: tasks.trigger('manual-venue-scrape', { limit: 5 })
export const manualVenueScrape = task({
  id: 'manual-venue-scrape',
  retry: { maxAttempts: 1 },
  run: async (payload: RunVenueScrapePayload) => runVenueScrape({ limit: payload.limit ?? 10 }),
})
