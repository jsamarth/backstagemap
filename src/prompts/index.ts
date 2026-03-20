export function homepageSystemPrompt(today: string): string {
  return `Extract upcoming events AND identify sub-URLs for calendar/events/shows pages. Return empty arrays if none found. Only events on or after ${today}.`
}

export function subUrlsSystemPrompt(today: string): string {
  return `Extract all upcoming music events from these venue calendar/events pages. Return empty array if none found. ONLY RETURN EVENTS THAT ARE MUSIC RELATED. Only events on or after ${today}.`
}
