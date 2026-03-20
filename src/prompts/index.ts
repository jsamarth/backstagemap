const classificationRules = `
IMPORTANT: Event type classification rules:
- If the event name or description contains "jam", "open jam", "live jam", or similar jam-related language, ALWAYS classify it as "jam_session" — never as "live_band".
- Use "live_band" only when a specific band or artist is performing a set.
- Use "open_mic" only when performers sign up to play short sets to an audience.
- Use "dj" only when a DJ is spinning/mixing.`

export function homepageSystemPrompt(today: string): string {
  return `Extract upcoming events AND identify sub-URLs for calendar/events/shows pages. Return empty arrays if none found. Only events on or after ${today}.${classificationRules}`
}

export function subUrlsSystemPrompt(today: string): string {
  return `Extract all upcoming music events from these venue calendar/events pages. Return empty array if none found. ONLY RETURN EVENTS THAT ARE MUSIC RELATED. Only events on or after ${today}.${classificationRules}`
}
