import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { resolve } from 'path'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, OPENAI_KEY } from './_env'

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(level: 'info' | 'ok' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString()
  const prefix = { info: '·', ok: '✓', warn: '⚠', error: '✗' }[level]
  console.log(`[${ts}] ${prefix} ${msg}`)
}

function section(title: string) {
  const bar = '─'.repeat(72)
  console.log(`\n${bar}`)
  console.log(`  ${title}`)
  console.log(`${bar}\n`)
}

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

// ── Tool definition (exact copy from ai-parse.ts) ────────────────────────────

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

// ── Argument parsing ──────────────────────────────────────────────────────────

const isRandom  = process.argv.includes('--random')
const eventId   = process.argv[2] !== '--random' ? process.argv[2] : undefined

if (!isRandom && !eventId) {
  console.error('Usage:')
  console.error('  bun run scripts/debug-parse.ts <event_id>')
  console.error('  bun run scripts/debug-parse.ts --random')
  process.exit(1)
}

// ── Main ──────────────────────────────────────────────────────────────────────

const wallStart = Date.now()

section('debug-parse — DRY RUN — no data written')
log('info', `Args: ${isRandom ? '--random' : `event_id=${eventId}`}`)

log('info', 'Initializing Supabase client...')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
log('ok', 'Supabase client ready')

log('info', 'Initializing OpenAI client...')
const openai = new OpenAI({ apiKey: OPENAI_KEY })
log('ok', 'OpenAI client ready')

// ── Resolve event + venue ─────────────────────────────────────────────────────

section('Step 1 — Resolve Event + Venue')

type EventRow = {
  id: string
  event_name: string
  artist_name: string | null
  date: string
  time_start: string | null
  event_type: string
  venues: {
    id: string
    name: string
    raw_html_url: string | null
    scraped_url: string | null
    website_url: string | null
  } | null
}

let event: EventRow

if (isRandom) {
  log('info', 'Query: SELECT events + venues WHERE venues.raw_html_url IS NOT NULL')
  const { data, error } = await supabase
    .from('events')
    .select('id, event_name, artist_name, date, time_start, event_type, venues(id, name, raw_html_url, scraped_url, website_url)')
    .not('venues.raw_html_url', 'is', null)

  if (error) {
    log('error', `DB query failed: ${error.message}`)
    process.exit(1)
  }

  const candidates = (data ?? []).filter((e) => (e.venues as { raw_html_url?: string | null } | null)?.raw_html_url)
  log('info', `Found ${candidates.length} candidate events with a venue raw_html_url`)

  if (candidates.length === 0) {
    log('error', 'No events with a venue raw_html_url found — nothing to debug')
    process.exit(1)
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)] as EventRow
  log('ok', `Randomly selected: "${pick.event_name}" (id=${pick.id}) @ ${pick.venues?.name}`)
  event = pick
} else {
  log('info', `Query: SELECT event id=${eventId} + venue`)
  const { data, error } = await supabase
    .from('events')
    .select('id, event_name, artist_name, date, time_start, event_type, venues(id, name, raw_html_url, scraped_url, website_url)')
    .eq('id', eventId!)
    .single()

  if (error || !data) {
    log('error', `Event not found (id=${eventId}): ${error?.message ?? 'no data'}`)
    process.exit(1)
  }

  event = data as EventRow
  log('ok', `Found event: "${event.event_name}" (id=${event.id})`)
}

const venue = event.venues
if (!venue) {
  log('error', 'Event has no associated venue')
  process.exit(1)
}

log('info', `Event fields:`)
log('info', `  id          = ${event.id}`)
log('info', `  event_name  = ${event.event_name}`)
log('info', `  artist_name = ${event.artist_name ?? '(null)'}`)
log('info', `  date        = ${event.date}`)
log('info', `  time_start  = ${event.time_start ?? '(null)'}`)
log('info', `  event_type  = ${event.event_type}`)
log('info', `Venue fields:`)
log('info', `  id           = ${venue.id}`)
log('info', `  name         = ${venue.name}`)
log('info', `  raw_html_url = ${venue.raw_html_url ?? '(null)'}`)
log('info', `  scraped_url  = ${venue.scraped_url ?? '(null)'}`)
log('info', `  website_url  = ${venue.website_url ?? '(null)'}`)

if (!venue.raw_html_url) {
  log('error', `Venue "${venue.name}" has no raw_html_url — cannot replay parse`)
  process.exit(1)
}

// ── Download raw markdown ─────────────────────────────────────────────────────

section('Step 2 — Download Raw Markdown from Storage')

log('info', `Bucket: ${STORAGE_BUCKET}`)
log('info', `Path:   ${venue.raw_html_url}`)
log('info', 'Downloading...')

const downloadStart = Date.now()
const { data: fileData, error: storageErr } = await supabase.storage
  .from(STORAGE_BUCKET)
  .download(venue.raw_html_url)

if (storageErr) {
  log('error', `Storage download failed: ${storageErr.message}`)
  process.exit(1)
}

const downloadMs = Date.now() - downloadStart
const markdown = await fileData.text()
const bytes = markdown.length
const roughTokens = Math.round(bytes / 4)

log('ok', `Downloaded in ${downloadMs}ms — ${bytes} bytes (~${roughTokens} tokens)`)

console.log('\n┌─ RAW MARKDOWN START ' + '─'.repeat(51) + '┐')
console.log(markdown)
console.log('└─ RAW MARKDOWN END ' + '─'.repeat(53) + '┘\n')

// ── GPT-4o call ───────────────────────────────────────────────────────────────

section('Step 3 — GPT-4o Parse (read-only replay)')

const PROMPTS_DIR = resolve(import.meta.dir, '..', 'prompts')
const promptFilePath = `${PROMPTS_DIR}/ai-parse-system.txt`
const today = new Date().toISOString().split('T')[0]
const systemPrompt = (await Bun.file(promptFilePath).text())
  .replace('{{TODAY}}', today)

log('info', `Prompt file:       ${promptFilePath}`)
log('info', `Prompt length:     ${systemPrompt.length} chars`)
log('info', `Model:             gpt-4o`)
log('info', `Temperature:       0`)
log('info', `User content:      ${markdown.length} chars`)
log('info', `Tool:              extract_events (forced)`)
log('info', 'Calling GPT-4o...')

const gptStart = Date.now()
const completion = await openai.chat.completions.create({
  model:       'gpt-4o',
  temperature: 0,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: markdown },
  ],
  tools:       [extractEventsTool],
  tool_choice: { type: 'function', function: { name: 'extract_events' } },
})
const gptMs = Date.now() - gptStart

const usage       = completion.usage
const finishReason = completion.choices[0]?.finish_reason
const toolCall    = completion.choices[0]?.message?.tool_calls?.[0]

log('ok', `GPT-4o responded in ${gptMs}ms`)
log('info', `Finish reason:     ${finishReason}`)
if (usage) {
  log('info', `Prompt tokens:     ${usage.prompt_tokens}`)
  log('info', `Completion tokens: ${usage.completion_tokens}`)
  log('info', `Total tokens:      ${usage.total_tokens}`)
}

if (!toolCall) {
  log('error', 'GPT-4o returned no tool call — cannot extract events')
  process.exit(1)
}

console.log('\n┌─ RAW TOOL CALL ARGUMENTS START ' + '─'.repeat(40) + '┐')
console.log(JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2))
console.log('└─ RAW TOOL CALL ARGUMENTS END ' + '─'.repeat(42) + '┘\n')

// ── Parse + display results ───────────────────────────────────────────────────

section('Step 4 — Parsed Events')

const { events: extracted } = JSON.parse(toolCall.function.arguments) as { events: ExtractedEvent[] }

log('ok', `Extracted ${extracted.length} event(s)`)

for (let i = 0; i < extracted.length; i++) {
  const e = extracted[i]
  console.log(`\n  [${i + 1}/${extracted.length}]`)
  console.log(`    event_name:   ${e.event_name}`)
  console.log(`    artist_name:  ${e.artist_name ?? '(null)'}`)
  console.log(`    date:         ${e.date}`)
  console.log(`    time_start:   ${e.time_start ?? '(null)'}`)
  console.log(`    time_end:     ${e.time_end ?? '(null)'}`)
  console.log(`    event_type:   ${e.event_type}`)
  console.log(`    price_type:   ${e.price_type}`)
  console.log(`    price_amount: ${e.price_amount ?? '(null)'}`)
  console.log(`    description:  ${e.description ? e.description.slice(0, 120) + (e.description.length > 120 ? '…' : '') : '(null)'}`)
}

// ── Summary ───────────────────────────────────────────────────────────────────

section('Summary')

const wallMs = Date.now() - wallStart
log('ok', `Total wall time:   ${wallMs}ms`)
log('ok', `Events extracted:  ${extracted.length}`)
log('ok', `Venue:             ${venue.name}`)
log('ok', `Event:             ${event.event_name} (${event.date})`)
log('ok', 'DRY RUN — no data written')
