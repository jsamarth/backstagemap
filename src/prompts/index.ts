const classificationRules = `
IMPORTANT: Event type classification rules:
- If the event name or description contains "jam", "open jam", "live jam", or similar jam-related language, ALWAYS classify it as "jam_session" — never as "live_band".
- Use "live_band" only when a specific band or artist is performing a set.
- Use "open_mic" only when performers sign up to play short sets to an audience. NOTE: "open mic" events that are comedy-focused (e.g. comedy open mic, stand-up open mic) are NOT music events — exclude them entirely.
- Use "dj" only when a DJ is spinning/mixing.`

const musicOnlyRule = `
CRITICAL: Only extract MUSIC events. Exclude any event that is primarily comedy, spoken word, trivia, karaoke (unless it has a live music component), film screening, or any other non-music activity. When in doubt about whether an "open mic" event is music or comedy, exclude it.`

export function homepageSystemPrompt(today: string): string {
  return `Extract upcoming music events AND identify sub-URLs for calendar/events/shows pages. Return empty arrays if none found. Only events on or after ${today}.${musicOnlyRule}${classificationRules}`
}

export function subUrlsSystemPrompt(today: string): string {
  return `Extract all upcoming music events from these venue calendar/events pages. Return empty array if none found. Only events on or after ${today}.${musicOnlyRule}${classificationRules}`
}
