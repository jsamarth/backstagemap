import type OpenAI from 'openai'

export const extractEventsTool: OpenAI.Chat.ChatCompletionTool = {
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

export const identifyCalendarUrlsTool: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'identify_calendar_urls',
    description: 'Identify sub-URLs on the page that link to calendar, events, or shows pages (max 5). DO NOT include any URLs that are not relevant to music related events. For eg. if a URL is about menu or drinks or about, skip that.',
    parameters: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', description: 'Absolute or relative URL to a calendar/events/shows page' },
        },
      },
    },
  },
}
