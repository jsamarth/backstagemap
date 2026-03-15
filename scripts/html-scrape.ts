import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } from './_env'
import { crawlToMarkdown } from '../api/_crawl'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function log(level: 'info' | 'ok' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString()
  const prefix = { info: '·', ok: '✓', warn: '⚠', error: '✗' }[level]
  console.log(`[${ts}] ${prefix} ${msg}`)
}

const FAIL_THRESHOLD = 5
const DEFAULT_BATCH_SIZE = 30

const limitArg = getArg('--limit')
const BATCH_SIZE = limitArg ? parseInt(limitArg, 10) : DEFAULT_BATCH_SIZE

log('info', `Starting html-scrape — batch size: ${BATCH_SIZE}`)

// Prune past events (keep yesterday's in case of timezone edge cases)
const pruneDate = new Date(Date.now() - 86400000).toISOString().split('T')[0]
const { count: pruneCount } = await supabase
  .from('events')
  .delete()
  .lt('date', pruneDate)

log('info', `Pruned ${pruneCount ?? 0} past events (before ${pruneDate})`)

const { data: venues } = await supabase
  .from('venues')
  .select('id, name, website_url, scrape_fail_count')
  .eq('scrape_status', 'not_started')
  .order('last_scraped_at', { ascending: true, nullsFirst: true })
  .limit(BATCH_SIZE)

const total = (venues ?? []).length
log('info', `Found ${total} venues with scrape_status=not_started`)

let scraped = 0
let failed = 0

for (let i = 0; i < (venues ?? []).length; i++) {
  const venue = venues![i]
  const targetUrl = venue.website_url
  const venueName = venue.name ?? venue.id

  log('info', `[${i + 1}/${total}] "${venueName}" — scraping ${targetUrl ?? '(no URL)'} ...`)

  if (!targetUrl) {
    log('error', `  No website_url — skipping`)
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
    const { markdown, provider } = await crawlToMarkdown(targetUrl)
    log('ok', `  Crawl complete — ${markdown.length} bytes of markdown (provider=${provider})`)

    const timestamp   = new Date().toISOString()
    const storagePath = `${venue.id}/${timestamp}.md`

    log('info', `  Uploading to storage: ${storagePath}`)

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, markdown, { contentType: 'text/markdown' })

    if (uploadErr) throw uploadErr

    const { error: updateErr } = await supabase.from('venues').update({
      raw_html_url:    storagePath,
      scraped_url:     targetUrl,
      last_scraped_at: timestamp,
      scrape_status:   'html_scraped' as string,
      scrape_error:    null,
      scrape_provider: provider,
    }).eq('id', venue.id)

    if (updateErr) throw updateErr

    await supabase.from('scrape_logs').insert({
      venue_id: venue.id,
      workflow: 'html_scrape',
      status:   'success',
    })

    scraped++
  } catch (err: unknown) {
    const newFailCount = (venue.scrape_fail_count ?? 0) + 1
    log('error', `  Scrape failed: ${(err as Error).message}`)
    log('info', `  scrape_fail_count now ${newFailCount} (threshold ${FAIL_THRESHOLD})`)

    const update: Record<string, unknown> = {
      scrape_error:      (err as Error).message,
      scrape_fail_count: newFailCount,
    }
    if (newFailCount >= FAIL_THRESHOLD) {
      update.scrape_status = 'failed'
      log('warn', `  Marking as failed (${FAIL_THRESHOLD}+ consecutive failures)`)
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

log('ok', `Done. scraped=${scraped} failed=${failed}`)
