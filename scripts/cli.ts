import { intro, outro, select, text, confirm, isCancel, cancel } from '@clack/prompts'
import { readdirSync } from 'fs'
import { resolve } from 'path'

// ── Arg config for known scripts ──────────────────────────────────────────────
// Add an entry here when a new script has flags worth prompting for.
// Scripts NOT listed here are run with no args.

type ArgPrompt =
  | { type: 'limit' }
  | { type: 'force';  message: string }
  | { type: 'select'; message: string; options: { value: string; label: string }[]; flag?: string }
  | { type: 'text';   message: string; flag: string; required?: boolean }

type ScriptConfig = {
  hint:  string
  args?: ArgPrompt[]
}

const SCRIPT_CONFIG: Record<string, ScriptConfig> = {
  'venue-discovery': {
    hint: 'Discover new venues via Google Maps',
    args: [{ type: 'limit' }, { type: 'force', message: 'Force-update existing venues?' }],
  },
  'html-scrape': {
    hint: 'Scrape venue websites via Firecrawl',
    args: [{ type: 'limit' }],
  },
  'ai-parse': {
    hint: 'Parse HTML → events via GPT-4o',
    args: [{ type: 'limit' }],
  },
  'freshness-reset': {
    hint: 'Reset extracted venues to not_started',
    args: [{ type: 'limit' }],
  },
  'debug-parse': {
    hint: 'Dry-run parse a single venue (no writes)',
    args: [{
      type: 'select',
      message: 'Target venue:',
      options: [
        { value: '--random', label: 'Random venue' },
        { value: '--venue_id', label: 'Enter venue ID' },
      ],
    }],
  },
  'debug-scrape': {
    hint: 'Dry-run crawl a single venue (no writes)',
    args: [
      { type: 'text', message: 'Venue UUID:', flag: '--venue-id', required: true },
      {
        type: 'select',
        message: 'Provider:',
        flag: '--provider',
        options: [
          { value: 'firecrawl', label: 'Firecrawl (default)' },
          { value: 'apify',     label: 'Apify' },
        ],
      },
    ],
  },
  'batch-pipeline': {
    hint: 'Run full scrape pipeline for multiple venues (dry-run by default)',
    args: [
      { type: 'limit' },
      {
        type: 'select',
        message: 'Which venues?',
        options: [
          { value: '',                  label: 'Not yet scraped (not_started)' },
          { value: '--include-scraped', label: 'Include previously scraped (+ extracted)' },
        ],
      },
      {
        type: 'select',
        message: 'Save results to Supabase?',
        options: [
          { value: '',       label: 'No — dry run (default)' },
          { value: '--save', label: 'Yes — persist to DB + storage' },
        ],
      },
      {
        type: 'select',
        message: 'Provider:',
        flag: '--provider',
        options: [
          { value: 'auto',      label: 'Auto (Apify if key set, else Firecrawl)' },
          { value: 'firecrawl', label: 'Firecrawl' },
          { value: 'apify',     label: 'Apify' },
        ],
      },
    ],
  },
  'run-pipeline': {
    hint: 'Run full scrape pipeline locally for one venue (dry-run by default)',
    args: [
      { type: 'text', message: 'Venue UUID:', flag: '--venue-id', required: true },
      {
        type: 'select',
        message: 'Save results to Supabase?',
        options: [
          { value: '',       label: 'No — dry run (default)' },
          { value: '--save', label: 'Yes — persist to DB + storage' },
        ],
      },
      {
        type: 'select',
        message: 'Provider:',
        flag: '--provider',
        options: [
          { value: 'auto',      label: 'Auto (Apify if key set, else Firecrawl)' },
          { value: 'firecrawl', label: 'Firecrawl' },
          { value: 'apify',     label: 'Apify' },
        ],
      },
    ],
  },
  'view-scrapes': {
    hint: 'List (and optionally print) scraped pages for a venue',
    args: [
      { type: 'text', message: 'Venue UUID:', flag: '--venue-id', required: true },
      {
        type: 'select',
        message: 'Show markdown content?',
        options: [
          { value: '',       label: 'No — just list files' },
          { value: '--show', label: 'Yes — print content' },
        ],
      },
    ],
  },
}

// ── Discover scripts dynamically ─────────────────────────────────────────────

const SCRIPTS_DIR = resolve(import.meta.dir)
const discovered = readdirSync(SCRIPTS_DIR)
  .filter(f => f.endsWith('.ts') && !f.startsWith('_') && f !== 'cli.ts')
  .map(f => f.replace(/\.ts$/, ''))
  .sort()

// ── Build argv from prompts ────────────────────────────────────────────────────

async function buildArgs(name: string): Promise<string[]> {
  const config = SCRIPT_CONFIG[name]
  if (!config?.args) return []

  const argv: string[] = []

  for (const prompt of config.args) {
    if (prompt.type === 'limit') {
      const val = await text({ message: 'Limit? (leave blank for default)', placeholder: '' })
      if (isCancel(val)) { cancel('Cancelled'); process.exit(0) }
      if (val) argv.push('--limit', val)

    } else if (prompt.type === 'force') {
      const val = await confirm({ message: prompt.message, initialValue: false })
      if (isCancel(val)) { cancel('Cancelled'); process.exit(0) }
      if (val) argv.push('--force')

    } else if (prompt.type === 'select') {
      const val = await select({ message: prompt.message, options: prompt.options })
      if (isCancel(val)) { cancel('Cancelled'); process.exit(0) }
      if (prompt.flag) {
        argv.push(prompt.flag, val as string)
      } else {
        argv.push(val as string)
        // If --venue_id selected, follow up with a text prompt for the UUID
        if (val === '--venue_id') {
          const id = await text({ message: 'Venue UUID:' })
          if (isCancel(id) || !id) { cancel('Cancelled'); process.exit(0) }
          argv.push(id)
        }
      }

    } else if (prompt.type === 'text') {
      const val = await text({ message: prompt.message })
      if (isCancel(val)) { cancel('Cancelled'); process.exit(0) }
      if (prompt.required && !val) { cancel('Required'); process.exit(1) }
      if (val) argv.push(prompt.flag, val)
    }
  }

  return argv
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function run() {
  intro('BackstageMap Scripts')

  let again = true
  while (again) {
    const options = discovered.map(name => ({
      value: name,
      label: name,
      hint:  SCRIPT_CONFIG[name]?.hint ?? '',
    }))

    const chosen = await select({ message: 'Which script?', options })
    if (isCancel(chosen)) { cancel('Cancelled'); break }

    const args = await buildArgs(chosen as string)
    const cmd  = ['bun', 'run', `${SCRIPTS_DIR}/${chosen}.ts`, ...args]

    console.log()
    const proc = Bun.spawn(cmd, { stdio: ['inherit', 'inherit', 'inherit'] })
    await proc.exited
    console.log()

    const more = await confirm({ message: 'Run another script?', initialValue: false })
    if (isCancel(more) || !more) again = false
  }

  outro('Done')
}

run()
