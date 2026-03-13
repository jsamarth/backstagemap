import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FAIL_THRESHOLD = 5
const BATCH_SIZE = 30

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url:             targetUrl,
          formats:         ['markdown'],
          onlyMainContent: true,
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Firecrawl returned success=false')

      const timestamp   = new Date().toISOString()
      const storagePath = `${venue.id}/${timestamp}.md`

      const { error: uploadErr } = await supabase.storage
        .from(process.env.SCRAPE_STORAGE_BUCKET ?? 'html-scrapes')
        .upload(storagePath, data.data.markdown, { contentType: 'text/markdown' })

      if (uploadErr) throw uploadErr

      await supabase.from('venues').update({
        raw_html_url:    storagePath,
        last_scraped_at: timestamp,
        scrape_status:   'html_scraped' as any,
        scrape_error:    null,
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'html_scrape',
        status:   'success',
      })

      scraped++
    } catch (err: any) {
      const newFailCount = (venue.scrape_fail_count ?? 0) + 1
      const update: Record<string, unknown> = {
        scrape_error:      err.message,
        scrape_fail_count: newFailCount,
      }
      if (newFailCount >= FAIL_THRESHOLD) {
        update.scrape_status = 'failed' as any
      }

      await supabase.from('venues').update(update).eq('id', venue.id)
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'html_scrape',
        status:   'failure',
        error:    err.message,
      })

      failed++
    }
  }

  return NextResponse.json({ scraped, failed, skipped: 0 })
}
