import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET } from './_env'
import { getArg } from './_utils'

const venueId = getArg('--venue-id')
const showContent = process.argv.includes('--show')

if (!venueId) {
  console.error('Usage: bun run scripts/view-scrapes.ts -- --venue-id <uuid> [--show]')
  console.error('  --show   Print the markdown content of each file')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Fetch venue info
const { data: venue } = await supabase
  .from('venues')
  .select('name, website_url, scrape_status, last_scraped_at, raw_html_url')
  .eq('id', venueId)
  .single()

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw_html_url not yet in generated types
const rawHtmlUrl: string | null = (venue as any)?.raw_html_url ?? null

if (venue) {
  console.log(`\nVenue : ${venue.name}`)
  console.log(`URL   : ${venue.website_url ?? '(none)'}`)
  console.log(`Status: ${venue.scrape_status ?? '(unknown)'}`)
  console.log(`Last scraped: ${venue.last_scraped_at ?? '(never)'}`)
  console.log(`Storage key : ${rawHtmlUrl ?? '(none)'}`)
}

async function showFile(storagePath: string, kb?: string) {
  const created = ''
  console.log(`  ${storagePath}${kb ?? ''}${created}`)

  if (showContent) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath)

    if (dlErr) {
      console.error(`    [download error] ${dlErr.message}`)
      return
    }

    const text = await blob.text()
    const divider = '─'.repeat(72)
    console.log(`\n${divider}`)
    console.log(text)
    console.log(divider)
  }
}

async function listAndShow(prefix: string, label: string, excludePaths: Set<string> = new Set()) {
  const { data: files, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { sortBy: { column: 'created_at', order: 'asc' } })

  if (error) {
    console.error(`\n[${label}] Storage list error: ${error.message}`)
    return
  }

  const relevant = (files ?? []).filter(f => !excludePaths.has(`${prefix}/${f.name}`))

  if (relevant.length === 0) {
    console.log(`\n── ${label} ── (no files)`)
    return
  }

  console.log(`\n── ${label} ── (${relevant.length} file${relevant.length === 1 ? '' : 's'})`)

  for (const file of relevant) {
    const kb = file.metadata?.size != null
      ? ` (${(file.metadata.size / 1024).toFixed(1)} KB)`
      : ''
    await showFile(`${prefix}/${file.name}`, kb)
  }
}

// ── Homepage ──────────────────────────────────────────────────────────────────
// raw_html_url is the authoritative path written by scrapeHomepage.
// It may be flat (old: venueId/timestamp.md) or nested (new: venueId/homepage/timestamp.md).
const shownHomepagePaths = new Set<string>()

if (rawHtmlUrl) {
  console.log(`\n── Homepage scrapes ── (1 file)`)
  await showFile(rawHtmlUrl)
  shownHomepagePaths.add(rawHtmlUrl)
} else {
  // Also list venueId/ root for old flat format (exclude subfolder entries)
  const { data: rootFiles } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(venueId, { sortBy: { column: 'created_at', order: 'asc' } })

  const flatFiles = (rootFiles ?? []).filter(f => f.name.endsWith('.md'))
  if (flatFiles.length > 0) {
    console.log(`\n── Homepage scrapes ── (${flatFiles.length} file${flatFiles.length === 1 ? '' : 's'})`)
    for (const file of flatFiles) {
      const kb = file.metadata?.size != null ? ` (${(file.metadata.size / 1024).toFixed(1)} KB)` : ''
      const path = `${venueId}/${file.name}`
      shownHomepagePaths.add(path)
      await showFile(path, kb)
    }
  } else {
    // Try new nested path
    await listAndShow(`${venueId}/homepage`, 'Homepage scrapes')
  }
}

// ── Sub-URL scrapes ───────────────────────────────────────────────────────────
await listAndShow(`${venueId}/suburls`, 'Sub-URL scrapes')

console.log()
