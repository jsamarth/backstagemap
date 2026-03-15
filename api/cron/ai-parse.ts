import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: venues } = await supabase
    .from('venues')
    .select('id, raw_html_url')
    .eq('scrape_status', 'html_scraped')

  let parsed = 0
  let eventsUpserted = 0
  let errors = 0

  const today = new Date().toISOString().split('T')[0]

  for (const venue of venues ?? []) {
    if (!venue.raw_html_url) {
      errors++
      continue
    }

    try {
      const { data: fileData, error: storageErr } = await supabase.storage
        .from(process.env.SCRAPE_STORAGE_BUCKET ?? 'html-scrapes')
        .download(venue.raw_html_url)

      if (storageErr) throw storageErr

      const markdown = await fileData.text()

      const completion = await openai.chat.completions.create({
        model:       'gpt-4o',
        temperature: 0,
        messages: [
          {
            role:    'system',
            content: `You are a structured data extractor. Today's date is ${today}. Extract all upcoming music events from the provided venue calendar page. Return only events with dates on or after today. If a field is not present in the source material, return null for that field.`,
          },
          {
            role:    'user',
            content: markdown,
          },
        ],
        tools:       [extractEventsTool],
        tool_choice: { type: 'function', function: { name: 'extract_events' } },
      })

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
      if (!toolCall) throw new Error('GPT-4o returned no tool call')

      const { events } = JSON.parse(toolCall.function.arguments) as { events: ExtractedEvent[] }

      for (const event of events) {
        const { error } = await supabase.from('events').upsert(
          {
            venue_id:     venue.id,
            event_name:   event.event_name,
            artist_name:  event.artist_name,
            date:         event.date,
            time_start:   event.time_start,
            time_end:     event.time_end,
            price_type:   event.price_type,
            price_amount: event.price_amount,
            description:  event.description,
            event_type:   event.event_type,
            parsed_at:    new Date().toISOString(),
          },
          { onConflict: 'venue_id,date,event_name' }
        )
        if (!error) eventsUpserted++
      }

      await supabase.from('venues').update({
        scrape_status: 'extracted' as string,
        extracted_at:  new Date().toISOString(),
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'ai_parse',
        status:   'success',
      })

      parsed++
    } catch (err: unknown) {
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id,
        workflow: 'ai_parse',
        status:   'failure',
        error:    (err as Error).message,
      })
      errors++
    }
  }

  return res.status(200).json({ parsed, events_upserted: eventsUpserted, errors })
}
