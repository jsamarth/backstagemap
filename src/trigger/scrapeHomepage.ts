import { task } from '@trigger.dev/sdk'
import { crawlToMarkdown } from '../lib/crawl'
import { getSupabaseClient, STORAGE_BUCKET } from './lib/supabase'
import type { ScrapeHomepagePayload, ScrapeHomepageOutput } from './lib/types'
import { ScrapeWorkflow } from './lib/types'

export const scrapeHomepage = task({
  id: 'scrape-homepage',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    factor: 3,
    randomize: true,
  },
  run: async (payload: ScrapeHomepagePayload): Promise<ScrapeHomepageOutput> => {
    const { venueId, url } = payload
    console.log(`[scrape-homepage] START venueId=${venueId} url=${url}`)

    const { markdown, provider } = await crawlToMarkdown(url, undefined, { singlePage: true })
    if (!markdown.trim()) throw new Error(`Crawl returned empty content (provider=${provider})`)
    const byteSize = markdown.length
    console.log(`[scrape-homepage] provider=${provider} bytes=${byteSize}`)

    const supabase = getSupabaseClient()
    const timestamp = new Date().toISOString()
    const storageKey = `${venueId}/homepage/${timestamp}.md`

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, markdown, { contentType: 'text/markdown' })

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scrape_provider/scrape_error not yet in generated types
    const { error: updateErr } = await (supabase.from('venues') as any)
      .update({
        raw_html_url:    storageKey,
        scraped_url:     url,
        last_scraped_at: timestamp,
        scrape_provider: provider,
        scrape_error:    null,
      })
      .eq('id', venueId)

    if (updateErr) throw new Error(`Venue update failed: ${updateErr.message}`)

    await supabase.from('scrape_logs').insert({
      venue_id: venueId,
      workflow: ScrapeWorkflow.SCRAPE_HOMEPAGE,
      status:   'success',
    })

    console.log(`[scrape-homepage] DONE venueId=${venueId} storageKey=${storageKey}`)
    return { venueId, storageKey, provider, byteSize }
  },
})
