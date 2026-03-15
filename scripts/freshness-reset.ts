import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './_env'

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

const DEFAULT_RESET_BATCH_SIZE = 50

const limitArg = getArg('--limit')
const RESET_BATCH_SIZE = limitArg ? parseInt(limitArg, 10) : DEFAULT_RESET_BATCH_SIZE

log('info', `Starting freshness-reset — batch size: ${RESET_BATCH_SIZE}`)

const { data: venues } = await supabase
  .from('venues')
  .select('id')
  .eq('scrape_status', 'extracted')
  .order('extracted_at', { ascending: true })
  .limit(RESET_BATCH_SIZE)

const ids = (venues ?? []).map(v => v.id)
log('info', `Found ${ids.length} venues with scrape_status=extracted`)

if (ids.length === 0) {
  log('ok', `Done. reset=0 venues`)
  process.exit(0)
}

if (ids.length <= 10) {
  log('info', `Resetting venue IDs: ${ids.join(', ')}`)
} else {
  log('info', `Resetting ${ids.length} venue IDs (too many to list)`)
}

const { error } = await supabase
  .from('venues')
  .update({ scrape_status: 'not_started' as string })
  .in('id', ids)

if (error) {
  log('error', `Supabase update failed: ${error.message}`)
} else {
  log('ok', `Supabase update successful — ${ids.length} venues reset`)
}

await supabase.from('scrape_logs').insert({
  workflow: 'freshness_reset',
  status:   'success',
  error:    `${ids.length} venues reset to not_started`,
})

log('ok', `Done. reset=${ids.length} venues`)
