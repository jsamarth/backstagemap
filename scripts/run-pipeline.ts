/**
 * run-pipeline.ts
 *
 * Runs the full Trigger.dev scraping pipeline locally for a single venue.
 *
 * Usage:
 *   bun run scripts/run-pipeline.ts --venue-id <uuid> [--save] [--provider apify|firecrawl]
 *
 * By default this is a DRY RUN — nothing is written to Supabase or storage.
 * Pass --save to persist all results (storage uploads + DB upserts).
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } from './_env'
import { crawlToMarkdown } from '../src/lib/crawl'
import { homepageSystemPrompt, subUrlsSystemPrompt } from '../src/prompts'
import type { ExtractedEvent } from '../src/types'
import { extractEventsTool, identifyCalendarUrlsTool } from '../src/trigger/lib/openaiTools'
import { resolveSubUrls } from '../src/trigger/lib/urlUtils'
import { getArg, hasFlag, log, section } from './_utils'

const venueId       = getArg('--venue-id')
const providerRaw   = getArg('--provider')
const providerArg   = (providerRaw === 'apify' || providerRaw === 'firecrawl') ? providerRaw : undefined
const SAVE          = hasFlag('--save')

if (!venueId) {
  console.error('Usage: bun run scripts/run-pipeline.ts --venue-id <uuid> [--save] [--provider apify|firecrawl]')
  process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const openaiKey = process.env.OPENAI_API_KEY
if (!openaiKey) {
  console.error('[env] Missing required env var: OPENAI_API_KEY')
  process.exit(1)
}
const openai = new OpenAI({ apiKey: openaiKey })

// ── Main pipeline ─────────────────────────────────────────────────────────────

log('info', `venueId=${venueId}  save=${SAVE}  provider=${providerArg ?? 'auto'}`)
if (!SAVE) log('warn', 'DRY RUN — pass --save to persist results to Supabase')

// Fetch venue
const { data: venue, error: venueErr } = await supabase
  .from('venues')
  .select('id, name, website_url')
  .eq('id', venueId)
  .single()

if (venueErr || !venue) {
  log('error', `Venue not found: ${venueId}`)
  process.exit(1)
}
if (!venue.website_url) {
  log('error', `Venue "${venue.name}" has no website_url`)
  process.exit(1)
}

log('ok', `Found venue: "${venue.name}" — ${venue.website_url}`)

const today = new Date().toISOString().split('T')[0]

// ── STEP 1: Scrape homepage ───────────────────────────────────────────────────

section('STEP 1 — Scrape homepage')
log('step', `Crawling ${venue.website_url} (singlePage=true) ...`)

const { markdown: homepageMd, provider: homepageProvider } =
  await crawlToMarkdown(venue.website_url, providerArg, { singlePage: true })

log('ok', `Crawl complete — provider=${homepageProvider} bytes=${homepageMd.length}`)
log('data', `--- homepage markdown preview (first 500 chars) ---`)
log('data', homepageMd.slice(0, 500).replace(/\n/g, '\n  '))

let homepageStorageKey: string | null = null

if (SAVE) {
  const timestamp = new Date().toISOString()
  homepageStorageKey = `${venueId}/homepage/${timestamp}.md`
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(homepageStorageKey, homepageMd, { contentType: 'text/markdown' })
  if (uploadErr) {
    log('error', `Storage upload failed: ${uploadErr.message}`)
    process.exit(1)
  }
  log('ok', `Uploaded to storage: ${homepageStorageKey}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('venues') as any).update({
    raw_html_url:    homepageStorageKey,
    scraped_url:     venue.website_url,
    last_scraped_at: timestamp,
    scrape_provider: homepageProvider,
    scrape_error:    null,
  }).eq('id', venueId)
  log('ok', 'Updated venue row (raw_html_url, last_scraped_at, scrape_provider)')
} else {
  log('info', '[dry-run] skipping storage upload and venue row update')
}

// ── STEP 2: Analyze homepage ──────────────────────────────────────────────────

section('STEP 2 — Analyze homepage with gpt-4o-mini')
log('step', `Calling gpt-4o-mini on ${homepageMd.length} bytes ...`)

const homepageCompletion = await openai.chat.completions.create({
  model:       'gpt-4o-mini',
  temperature: 0,
  messages: [
    { role: 'system', content: homepageSystemPrompt(today) },
    { role: 'user',   content: homepageMd },
  ],
  tools:       [extractEventsTool, identifyCalendarUrlsTool],
  tool_choice: 'auto',
})

let homepageEvents: ExtractedEvent[] = []
let rawSubUrls: string[] = []

for (const toolCall of homepageCompletion.choices[0]?.message?.tool_calls ?? []) {
  if (toolCall.function.name === 'extract_events') {
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as { events: ExtractedEvent[] }
      homepageEvents = parsed.events ?? []
    } catch {
      log('warn', 'failed to parse extract_events arguments — treating as 0 events')
    }
  } else if (toolCall.function.name === 'identify_calendar_urls') {
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as { urls: string[] }
      rawSubUrls = parsed.urls ?? []
    } catch {
      log('warn', 'failed to parse identify_calendar_urls arguments — treating as 0 URLs')
    }
  }
}

const subUrls = resolveSubUrls(rawSubUrls, venue.website_url)

log('ok', `Extracted events=${homepageEvents.length}  sub-URLs=${subUrls.length}`)

if (homepageEvents.length > 0) {
  log('data', '--- homepage events ---')
  for (const e of homepageEvents) {
    log('data', `  [${e.date}] ${e.event_name} (${e.event_type}, ${e.price_type}${e.price_amount ? `, $${e.price_amount}` : ''})`)
  }
}
if (subUrls.length > 0) {
  log('data', '--- sub-URLs to follow ---')
  for (const u of subUrls) log('data', `  ${u}`)
}

if (SAVE) {
  for (const event of homepageEvents) {
    await supabase.from('events').upsert({
      venue_id:     venueId,
      event_name:   event.event_name,
      artist_name:  event.artist_name,
      date:         event.date,
      time_start:   event.time_start,
      time_end:     event.time_end,
      price_type:   event.price_type,
      price_amount: event.price_amount,
      description:  event.description,
      event_type:   event.event_type,
      source_url:   venue.website_url,
      parsed_at:    new Date().toISOString(),
    }, { onConflict: 'venue_id,date,event_name' })
  }
  if (homepageEvents.length > 0) log('ok', `Upserted ${homepageEvents.length} events from homepage`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('venues') as any)
    .update({ sub_urls: subUrls, scrape_status: 'html_scraped' })
    .eq('id', venueId)
  log('ok', 'Updated venue.sub_urls + scrape_status=html_scraped')
} else {
  log('info', `[dry-run] skipping upsert of ${homepageEvents.length} homepage events`)
}

// ── STEP 3 & 4: Sub-URLs (if any) ────────────────────────────────────────────

if (subUrls.length === 0) {
  if (SAVE) {
    await supabase.from('venues')
      .update({ scrape_status: 'extracted', extracted_at: new Date().toISOString() })
      .eq('id', venueId)
    log('ok', 'No sub-URLs — marked venue as extracted')
  } else {
    log('info', '[dry-run] No sub-URLs found — pipeline complete (homepage only)')
  }
} else {
  section('STEP 3 — Scrape sub-URLs')
  const subUrlParts: string[] = []
  let urlsScraped = 0

  for (const url of subUrls) {
    log('step', `Crawling ${url} ...`)
    try {
      const { markdown: subMd, provider: subProvider } =
        await crawlToMarkdown(url, providerArg, { singlePage: true })
      log('ok', `  provider=${subProvider} bytes=${subMd.length}`)
      subUrlParts.push(`## Source: ${url}\n\n${subMd}`)
      urlsScraped++
    } catch (err) {
      log('warn', `  Failed to scrape ${url}: ${(err as Error).message}`)
    }
  }

  if (urlsScraped === 0) {
    log('error', 'All sub-URLs failed to scrape — stopping')
    process.exit(1)
  }

  const combinedMd = subUrlParts.join('\n\n---\n\n')
  log('ok', `Combined sub-URL markdown: urlsScraped=${urlsScraped} bytes=${combinedMd.length}`)

  let subUrlStorageKey: string | null = null

  if (SAVE) {
    const timestamp = new Date().toISOString()
    subUrlStorageKey = `${venueId}/suburls/${timestamp}.md`
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(subUrlStorageKey, combinedMd, { contentType: 'text/markdown' })
    if (uploadErr) {
      log('error', `Storage upload failed: ${uploadErr.message}`)
      process.exit(1)
    }
    log('ok', `Uploaded sub-URL markdown to: ${subUrlStorageKey}`)
  } else {
    log('info', '[dry-run] skipping sub-URL storage upload')
  }

  section('STEP 4 — Analyze sub-URLs with gpt-4o-mini')
  log('step', `Calling gpt-4o-mini on ${combinedMd.length} bytes ...`)

  const subUrlCompletion = await openai.chat.completions.create({
    model:       'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: subUrlsSystemPrompt(today) },
      { role: 'user',   content: combinedMd },
    ],
    tools:       [extractEventsTool],
    tool_choice: { type: 'function', function: { name: 'extract_events' } },
  })

  const subUrlToolCall = subUrlCompletion.choices[0]?.message?.tool_calls?.[0]
  if (!subUrlToolCall) {
    log('error', 'gpt-4o-mini returned no tool call for sub-URLs')
    process.exit(1)
  }

  let subUrlEvents: ExtractedEvent[] = []
  try {
    const parsed = JSON.parse(subUrlToolCall.function.arguments) as { events: ExtractedEvent[] }
    subUrlEvents = parsed.events ?? []
  } catch {
    log('warn', 'failed to parse sub-URL extract_events arguments — treating as 0 events')
  }

  log('ok', `Extracted events=${subUrlEvents.length} from sub-URLs`)

  if (subUrlEvents.length > 0) {
    log('data', '--- sub-URL events ---')
    for (const e of subUrlEvents) {
      log('data', `  [${e.date}] ${e.event_name} (${e.event_type}, ${e.price_type}${e.price_amount ? `, $${e.price_amount}` : ''})`)
    }
  }

  if (SAVE) {
    for (const event of subUrlEvents) {
      await supabase.from('events').upsert({
        venue_id:     venueId,
        event_name:   event.event_name,
        artist_name:  event.artist_name,
        date:         event.date,
        time_start:   event.time_start,
        time_end:     event.time_end,
        price_type:   event.price_type,
        price_amount: event.price_amount,
        description:  event.description,
        event_type:   event.event_type,
        source_url:   venue.website_url,
        parsed_at:    new Date().toISOString(),
      }, { onConflict: 'venue_id,date,event_name' })
    }
    log('ok', `Upserted ${subUrlEvents.length} events from sub-URLs`)

    await supabase.from('venues')
      .update({ scrape_status: 'extracted', extracted_at: new Date().toISOString() })
      .eq('id', venueId)
    log('ok', 'Marked venue as extracted')
  } else {
    log('info', `[dry-run] skipping upsert of ${subUrlEvents.length} sub-URL events`)
  }

  const totalEvents = homepageEvents.length + subUrlEvents.length

  section('SUMMARY')
  log('ok', `venue:          "${venue.name}"`)
  log('ok', `homepage events: ${homepageEvents.length}`)
  log('ok', `sub-URL events:  ${subUrlEvents.length}`)
  log('ok', `total events:    ${totalEvents}`)
  log('ok', `sub-URLs found:  ${subUrls.length}  (scraped ${urlsScraped})`)
  if (SAVE) {
    log('ok', `homepage storage: ${homepageStorageKey}`)
    log('ok', `sub-URL storage:  ${subUrlStorageKey}`)
  }
  log(SAVE ? 'ok' : 'warn', SAVE ? 'All results persisted.' : 'DRY RUN complete — nothing was saved.')
  process.exit(0)
}

section('SUMMARY')
log('ok', `venue:          "${venue.name}"`)
log('ok', `homepage events: ${homepageEvents.length}`)
log('ok', `sub-URLs found:  0`)
if (SAVE) log('ok', `homepage storage: ${homepageStorageKey}`)
log(SAVE ? 'ok' : 'warn', SAVE ? 'All results persisted.' : 'DRY RUN complete — nothing was saved.')
