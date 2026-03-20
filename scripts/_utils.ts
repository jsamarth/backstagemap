// Shared CLI utilities for scrape scripts.

export function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

type Level = 'info' | 'ok' | 'warn' | 'error' | 'step' | 'data'

const PREFIX: Record<Level, string> = {
  info: '·', ok: '✓', warn: '⚠', error: '✗', step: '▶', data: '  ',
}

export function log(level: Level, msg: string) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${PREFIX[level]} ${msg}`)
}

export function section(title: string) {
  const bar = '─'.repeat(72)
  console.log(`\n${bar}`)
  console.log(`  ${title}`)
  console.log(`${bar}\n`)
}
