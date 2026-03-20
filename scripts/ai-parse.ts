import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { resolve } from 'path'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, OPENAI_KEY } from './_env'
import type { ExtractedEvent } from '../src/types'
import { extractEventsTool } from '../src/trigger/lib/openaiTools'
import { ScrapeWorkflow } from '../src/trigger/lib/types'
import { getArg, log } from './_utils'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

const PROMPTS_DIR = resolve(import.meta.dir, '..', 'prompts')
const today = new Date().toISOString().split('T')[0]
const systemPrompt = (await Bun.file(`${PROMPTS_DIR}/ai-parse-system.txt`).text())
  .replace('{{TODAY}}', today)

const limitArg = getArg('--limit')
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity

log('info', `Starting ai-parse${isFinite(LIMIT) ? ` — limit: ${LIMIT}` : ''}`)

const { data: allVenues } = await supabase
  .from('venues')
  .select('id, name, raw_html_url, scraped_url, website_url')
  .eq('scrape_status', 'html_scraped')

const venues = isFinite(LIMIT) ? (allVenues ?? []).slice(0, LIMIT) : (allVenues ?? [])
const total = venues.length
log('info', `Found ${allVenues?.length ?? 0} venues with scrape_status=html_scraped${isFinite(LIMIT) ? `, processing ${total}` : ''}`)

let parsed = 0
let eventsUpserted = 0
let errors = 0

for (let i = 0; i < venues.length; i++) {
  const venue = venues[i]
  const venueName = venue.name ?? venue.id

  log('info', `[${i + 1}/${total}] Parsing "${venueName}" from ${venue.raw_html_url ?? '(no path)'} ...`)

  if (!venue.raw_html_url) {
    log('error', `  No raw_html_url — skipping`)
    errors++
    continue
  }

  try {
    const { data: fileData, error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(venue.raw_html_url)

    if (storageErr) throw storageErr

    const markdown = await fileData.text()
    const bytes = markdown.length
    const roughTokens = Math.round(bytes / 4)
    log('info', `  Markdown: ${bytes} bytes (~${roughTokens} tokens)`)

    log('info', `  → Calling GPT-4o (gpt-4o, temp=0) ...`)
    const completion = await openai.chat.completions.create({
      model:       'gpt-4o',
      temperature: 0,
      messages: [
        {
          role:    'system',
          content: systemPrompt,
        },
        {
          role:    'user',
          content: markdown,
        },
      ],
      tools:       [extractEventsTool],
      tool_choice: { type: 'function', function: { name: 'extract_events' } },
    })

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) throw new Error('GPT-4o returned no tool call')

    const { events } = JSON.parse(toolCall.function.arguments) as { events: ExtractedEvent[] }
    log('ok', `  ← Extracted ${events.length} events`)

    for (const event of events) {
      const { error } = await supabase.from('events').upsert(
        {
          venue_id:     venue.id,
          event_name:   event.event_name,
          artist_name:  event.artist_name,
          date:         event.date,
          time_start:   event.time_start,
          time_end:     event.time_end,
          price_type:   event.price_type,
          price_amount: event.price_amount,
          description:  event.description,
          event_type:   event.event_type,
          source_url:   venue.scraped_url ?? venue.website_url ?? null,
          parsed_at:    new Date().toISOString(),
        },
        { onConflict: 'venue_id,date,event_name' }
      )
      if (!error) {
        log('info', `    · "${event.event_name}" on ${event.date}`)
        eventsUpserted++
      } else {
        log('error', `    ✗ Failed to upsert "${event.event_name}": ${error.message}`)
      }
    }

    await supabase.from('venues').update({
      scrape_status: 'extracted' as string,
      extracted_at:  new Date().toISOString(),
    }).eq('id', venue.id)

    await supabase.from('scrape_logs').insert({
      venue_id: venue.id,
      workflow: ScrapeWorkflow.AI_PARSE,
      status:   'success',
    })

    parsed++
  } catch (err: unknown) {
    log('error', `  Parse failed: ${(err as Error).message}`)
    await supabase.from('scrape_logs').insert({
      venue_id: venue.id,
      workflow: ScrapeWorkflow.AI_PARSE,
      status:   'failure',
      error:    (err as Error).message,
    })
    errors++
  }
}

log('ok', `Done. parsed=${parsed} events_upserted=${eventsUpserted} errors=${errors}`)
