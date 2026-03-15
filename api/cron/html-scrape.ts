import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FAIL_THRESHOLD = 5
const BATCH_SIZE = 30

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Prune past events (keep yesterday's in case of timezone edge cases)
  await supabase
    .from('events')
    .delete()
    .lt('date', new Date(Date.now() - 86400000).toISOString().split('T')[0])

  const { data: venues } = await supabase
    .from('venues')
    .select('id, website_url, scrape_fail_count')
    .eq('scrape_status', 'not_started')
    .order('last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  let scraped = 0
  let failed = 0

  for (const venue of venues ?? []) {
    const targetUrl = venue.website_url
    if (!targetUrl) {
      failed++
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'html_scrape',
        status:   'failure',
        error:    'No website_url',
      })
      continue
    }

    try {
      const crawlRes = await fetch('https://api.firecrawl.dev/v1/crawl', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url:           targetUrl,
          limit:         20,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
        }),
      })

      const crawlData = await crawlRes.json()
      if (!crawlData.success) throw new Error(crawlData.error ?? 'Firecrawl crawl start failed')

      const crawlId: string = crawlData.id

      // Poll until complete (max 3 minutes)
      let markdown = ''
      const MAX_POLLS = 36
      for (let poll = 0; poll < MAX_POLLS; poll++) {
        await new Promise(r => setTimeout(r, 5000))
        const statusRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
          headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
        })
        const status = await statusRes.json()
        if (status.status === 'completed') {
          markdown = (status.data as Array<{ markdown?: string }>)
            .map(p => p.markdown ?? '')
            .filter(Boolean)
            .join('\n\n---\n\n')
          break
        }
        if (status.status === 'failed') throw new Error(`Firecrawl crawl failed: ${status.error ?? 'unknown'}`)
      }

      if (!markdown) throw new Error('Firecrawl crawl timed out or returned no content')

      const timestamp   = new Date().toISOString()
      const storagePath = `${venue.id}/${timestamp}.md`

      const { error: uploadErr } = await supabase.storage
        .from(process.env.SCRAPE_STORAGE_BUCKET ?? 'html-scrapes')
        .upload(storagePath, markdown, { contentType: 'text/markdown' })

      if (uploadErr) throw uploadErr

      await supabase.from('venues').update({
        raw_html_url:    storagePath,
        last_scraped_at: timestamp,
        scrape_status:   'html_scraped' as string,
        scrape_error:    null,
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'html_scrape',
        status:   'success',
      })

      scraped++
    } catch (err: unknown) {
      const newFailCount = (venue.scrape_fail_count ?? 0) + 1
      const update: Record<string, unknown> = {
        scrape_error:      (err as Error).message,
        scrape_fail_count: newFailCount,
      }
      if (newFailCount >= FAIL_THRESHOLD) {
        update.scrape_status = 'failed'
      }

      await supabase.from('venues').update(update).eq('id', venue.id)
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'html_scrape',
        status:   'failure',
        error:    (err as Error).message,
      })

      failed++
    }
  }

  return res.status(200).json({ scraped, failed })
}
