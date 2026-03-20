import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { resolve } from 'path'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, OPENAI_KEY } from './_env'
import type { ExtractedEvent } from '../src/types'
import { extractEventsTool } from '../src/trigger/lib/openaiTools'
import { getArg, log, section } from './_utils'

// ── Argument parsing ──────────────────────────────────────────────────────────

const isRandom = process.argv.includes('--random')
const venueId  = getArg('--venue_id')

if (!isRandom && !venueId) {
  console.error('Usage:')
  console.error('  bun run scripts/debug-parse.ts --random')
  console.error('  bun run scripts/debug-parse.ts --venue_id <uuid>')
  process.exit(1)
}
if (isRandom && venueId) {
  console.error('Error: --random and --venue_id are mutually exclusive')
  process.exit(1)
}

// ── Main ──────────────────────────────────────────────────────────────────────

const wallStart = Date.now()

section('debug-parse — DRY RUN — no data written')
log('info', `Args: ${isRandom ? '--random' : `venue_id=${venueId}`}`)

log('info', 'Initializing Supabase client...')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
log('ok', 'Supabase client ready')

log('info', 'Initializing OpenAI client...')
const openai = new OpenAI({ apiKey: OPENAI_KEY })
log('ok', 'OpenAI client ready')

// ── Resolve venue ─────────────────────────────────────────────────────────────

section('Step 1 — Resolve Venue')

type VenueRow = {
  id: string
  name: string
  raw_html_url: string | null
  website_url: string | null
}

let venue: VenueRow

if (isRandom) {
  log('info', 'Query: SELECT venues WHERE raw_html_url IS NOT NULL')
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, raw_html_url, website_url')
    .not('raw_html_url', 'is', null)

  if (error) {
    log('error', `DB query failed: ${error.message}`)
    process.exit(1)
  }

  const candidates = (data ?? []) as VenueRow[]
  log('info', `Found ${candidates.length} candidate venues with a raw_html_url`)

  if (candidates.length === 0) {
    log('error', 'No venues with a raw_html_url found — nothing to debug')
    process.exit(1)
  }

  venue = candidates[Math.floor(Math.random() * candidates.length)]
  log('ok', `Randomly selected: "${venue.name}" (id=${venue.id})`)
} else {
  log('info', `Query: SELECT venue id=${venueId}`)
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, raw_html_url, website_url')
    .eq('id', venueId!)
    .single()

  if (error || !data) {
    log('error', `Venue not found (id=${venueId}): ${error?.message ?? 'no data'}`)
    process.exit(1)
  }

  venue = data as VenueRow
  log('ok', `Found venue: "${venue.name}" (id=${venue.id})`)
}

log('info', `Venue fields:`)
log('info', `  id           = ${venue.id}`)
log('info', `  name         = ${venue.name}`)
log('info', `  raw_html_url = ${venue.raw_html_url ?? '(null)'}`)
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
log('ok', `Venue: ${venue.name} (id=${venue.id})`)
log('ok', 'DRY RUN — no data written')
