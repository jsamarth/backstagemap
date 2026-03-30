import { task } from '@trigger.dev/sdk'
import { crawlToMarkdown } from '@/lib/crawl'
import { getSupabaseClient, STORAGE_BUCKET } from '@/trigger/lib/supabase'
import type { ScrapeSubUrlsPayload, ScrapeSubUrlsOutput } from '@/trigger/lib/types'
import { ScrapeWorkflow } from '@/trigger/lib/types'

export const scrapeSubUrls = task({
  id: 'scrape-sub-urls',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    factor: 3,
    randomize: true,
  },
  run: async (payload: ScrapeSubUrlsPayload): Promise<ScrapeSubUrlsOutput> => {
    const { venueId, subUrls } = payload
    console.log(`[scrape-sub-urls] START venueId=${venueId} urls=${subUrls.length}`)

    const parts: string[] = []
    let urlsScraped = 0

    for (const url of subUrls) {
      try {
        const { markdown, provider } = await crawlToMarkdown(url, undefined, { singlePage: true })
        if (!markdown.trim()) throw new Error(`Crawl returned empty content (provider=${provider})`)
        console.log(`[scrape-sub-urls] provider=${provider} bytes=${markdown.length} url=${url}`)
        parts.push(`## Source: ${url}\n\n${markdown}`)
        urlsScraped++
      } catch (err) {
        console.warn(`[scrape-sub-urls] failed to scrape ${url}: ${(err as Error).message}`)
      }
    }

    if (urlsScraped === 0) {
      throw new Error(`All ${subUrls.length} sub-URLs failed to scrape`)
    }

    const combined = parts.join('\n\n---\n\n')
    const byteSize = combined.length
    console.log(`[scrape-sub-urls] combined bytes=${byteSize} urlsScraped=${urlsScraped}`)

    const supabase = getSupabaseClient()
    const timestamp = new Date().toISOString()
    const storageKey = `${venueId}/suburls/${timestamp}.md`

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, combined, { contentType: 'text/markdown' })

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    await supabase.from('scrape_logs').insert({
      venue_id: venueId,
      workflow: ScrapeWorkflow.SCRAPE_SUB_URLS,
      status:   'success',
    })

    console.log(`[scrape-sub-urls] DONE storageKey=${storageKey}`)
    return { venueId, storageKey, urlsScraped, byteSize }
  },
})
