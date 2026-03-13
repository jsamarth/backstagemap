import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, OPENAI_KEY } from './_env'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_KEY })

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function log(level: 'info' | 'ok' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString()
  const prefix = { info: '·', ok: '✓', warn: '⚠', error: '✗' }[level]
  console.log(`[${ts}] ${prefix} ${msg}`)
}

const extractEventsTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_events',
    description: 'Extract all upcoming music events from the venue calendar page',
    parameters: {
      type: 'object',
      required: ['events'],
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            required: ['event_name', 'date', 'event_type', 'price_type'],
            properties: {
              event_name:   { type: 'string' },
              artist_name:  { type: ['string', 'null'] },
              date:         { type: 'string', description: 'YYYY-MM-DD' },
              time_start:   { type: ['string', 'null'], description: 'HH:MM 24-hour format' },
              time_end:     { type: ['string', 'null'], description: 'HH:MM 24-hour format' },
              price_type:   { type: 'string', enum: ['free', 'cover', 'ticketed'] },
              price_amount: { type: ['number', 'null'] },
              description:  { type: ['string', 'null'] },
              event_type:   { type: 'string', enum: ['live_band', 'dj', 'open_mic', 'jam_session'] },
            },
          },
        },
      },
    },
  },
}

type ExtractedEvent = {
  event_name:   string
  artist_name:  string | null
  date:         string
  time_start:   string | null
  time_end:     string | null
  price_type:   'free' | 'cover' | 'ticketed'
  price_amount: number | null
  description:  string | null
  event_type:   'live_band' | 'dj' | 'open_mic' | 'jam_session'
}

const limitArg = getArg('--limit')
const LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity

log('info', `Starting ai-parse${isFinite(LIMIT) ? ` — limit: ${LIMIT}` : ''}`)

const { data: allVenues } = await supabase
  .from('venues')
  .select('id, name, raw_html_url')
  .eq('scrape_status', 'html_scraped')

const venues = isFinite(LIMIT) ? (allVenues ?? []).slice(0, LIMIT) : (allVenues ?? [])
const total = venues.length
log('info', `Found ${allVenues?.length ?? 0} venues with scrape_status=html_scraped${isFinite(LIMIT) ? `, processing ${total}` : ''}`)

let parsed = 0
let eventsUpserted = 0
let errors = 0

const today = new Date().toISOString().split('T')[0]

for (let i = 0; i < venues.length; i++) {
  const venue = venues[i]
  const venueName = (venue as any).name ?? venue.id

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
          content: `You are a structured data extractor. Today's date is ${today}. Extract all upcoming music events from the provided venue calendar page. Return only events with dates on or after today. If a field is not present in the source material, return null for that field.`,
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
      scrape_status: 'extracted' as any,
      extracted_at:  new Date().toISOString(),
    }).eq('id', venue.id)

    await supabase.from('scrape_logs').insert({
      venue_id: venue.id,
      workflow: 'ai_parse',
      status:   'success',
    })

    parsed++
  } catch (err: any) {
    log('error', `  Parse failed: ${err.message}`)
    await supabase.from('scrape_logs').insert({
      venue_id: venue.id,
      workflow: 'ai_parse',
      status:   'failure',
      error:    err.message,
    })
    errors++
  }
}

log('ok', `Done. parsed=${parsed} events_upserted=${eventsUpserted} errors=${errors}`)
