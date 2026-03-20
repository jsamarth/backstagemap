import { task } from '@trigger.dev/sdk'
import { getSupabaseClient } from './lib/supabase'
import { scrapeHomepage } from './scrapeHomepage'
import { analyzeHomepage } from './analyzeHomepage'
import { scrapeSubUrls } from './scrapeSubUrls'
import { analyzeSubUrls } from './analyzeSubUrls'
import type { VenueScrapePipelinePayload } from './lib/types'
import { SCRAPE_FAIL_THRESHOLD, ScrapeWorkflow } from './lib/types'

export const venueScrapePipeline = task({
  id: 'venue-scrape-pipeline',
  // Orchestrator does not retry; child tasks handle their own retries
  retry: { maxAttempts: 1 },
  run: async (payload: VenueScrapePipelinePayload) => {
    const { venueId, websiteUrl } = payload
    const supabase = getSupabaseClient()
    console.log(`[venue-scrape-pipeline] START venueId=${venueId} url=${websiteUrl}`)

    // ── Task 1: Scrape homepage ──────────────────────────────────────────────
    const homepageResult = await scrapeHomepage.triggerAndWait({ venueId, url: websiteUrl })

    if (!homepageResult.ok) {
      const errMsg = String(homepageResult.error)
      console.error(`[venue-scrape-pipeline] scrapeHomepage failed: ${errMsg}`)

      const { data: venue } = await supabase
        .from('venues')
        .select('scrape_fail_count')
        .eq('id', venueId)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scrape_fail_count not yet in generated types
      const newFailCount = ((venue as any)?.scrape_fail_count ?? 0) + 1
      const update: Record<string, unknown> = {
        scrape_error:      errMsg,
        scrape_fail_count: newFailCount,
      }
      if (newFailCount >= SCRAPE_FAIL_THRESHOLD) {
        update.scrape_status = 'failed'
        console.warn(`[venue-scrape-pipeline] marking venue as failed (${newFailCount} failures)`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns not yet in generated types
      await (supabase.from('venues') as any).update(update).eq('id', venueId)
      await supabase.from('scrape_logs').insert({
        venue_id: venueId,
        workflow: ScrapeWorkflow.VENUE_PIPELINE,
        status:   'failure',
        error:    errMsg,
      })
      return { venueId, status: 'homepage_scrape_failed' }
    }

    const { storageKey: homepageKey } = homepageResult.output

    // ── Task 2: Analyze homepage ─────────────────────────────────────────────
    const analyzeResult = await analyzeHomepage.triggerAndWait({
      venueId,
      storageKey: homepageKey,
      sourceUrl:  websiteUrl,
    })

    if (!analyzeResult.ok) {
      const errMsg = String(analyzeResult.error)
      console.error(`[venue-scrape-pipeline] analyzeHomepage failed: ${errMsg}`)
      await supabase.from('scrape_logs').insert({
        venue_id: venueId,
        workflow: ScrapeWorkflow.VENUE_PIPELINE,
        status:   'failure',
        error:    errMsg,
      })
      return { venueId, status: 'homepage_analyze_failed' }
    }

    const { subUrls } = analyzeResult.output

    // ── No sub-URLs: homepage events already saved, mark as extracted ────────
    if (subUrls.length === 0) {
      console.log(`[venue-scrape-pipeline] no sub-URLs found, marking extracted`)
      await supabase
        .from('venues')
        .update({ scrape_status: 'extracted', extracted_at: new Date().toISOString() })
        .eq('id', venueId)
      await supabase.from('scrape_logs').insert({
        venue_id: venueId,
        workflow: ScrapeWorkflow.VENUE_PIPELINE,
        status:   'success',
      })
      console.log(`[venue-scrape-pipeline] DONE eventsUpserted=${analyzeResult.output.eventsFound}`)
      return { venueId, status: 'extracted_from_homepage', eventsFound: analyzeResult.output.eventsFound }
    }

    // ── Task 3: Scrape sub-URLs ──────────────────────────────────────────────
    const subUrlScrapeResult = await scrapeSubUrls.triggerAndWait({ venueId, subUrls })

    if (!subUrlScrapeResult.ok) {
      // Non-fatal: homepage events were already saved; mark extracted anyway
      const errMsg = String(subUrlScrapeResult.error)
      console.warn(`[venue-scrape-pipeline] scrapeSubUrls failed (non-fatal): ${errMsg}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scrape_error not yet in generated types
      await (supabase.from('venues') as any)
        .update({
          scrape_status: 'extracted',
          extracted_at:  new Date().toISOString(),
          scrape_error:  errMsg,
        })
        .eq('id', venueId)
      await supabase.from('scrape_logs').insert({
        venue_id: venueId,
        workflow: ScrapeWorkflow.VENUE_PIPELINE,
        status:   'success',
      })
      return { venueId, status: 'extracted_homepage_only', eventsFound: analyzeResult.output.eventsFound }
    }

    const { storageKey: subUrlKey } = subUrlScrapeResult.output

    // ── Task 4: Analyze sub-URLs ─────────────────────────────────────────────
    const analyzeSubResult = await analyzeSubUrls.triggerAndWait({ venueId, storageKey: subUrlKey, subUrls, venueUrl: websiteUrl })

    if (!analyzeSubResult.ok) {
      const errMsg = String(analyzeSubResult.error)
      console.error(`[venue-scrape-pipeline] analyzeSubUrls failed: ${errMsg}`)
      await supabase.from('scrape_logs').insert({
        venue_id: venueId,
        workflow: ScrapeWorkflow.VENUE_PIPELINE,
        status:   'failure',
        error:    errMsg,
      })
      return { venueId, status: 'suburl_analyze_failed' }
    }

    const totalEvents = analyzeResult.output.eventsFound + analyzeSubResult.output.eventsFound

    await supabase.from('scrape_logs').insert({
      venue_id: venueId,
      workflow: ScrapeWorkflow.VENUE_PIPELINE,
      status:   'success',
    })

    console.log(`[venue-scrape-pipeline] DONE eventsUpserted=${totalEvents}`)
    return { venueId, status: 'extracted', eventsFound: totalEvents }
  },
})
