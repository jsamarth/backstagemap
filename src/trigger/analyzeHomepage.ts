import { task } from '@trigger.dev/sdk'
import { getSupabaseClient, STORAGE_BUCKET } from '@/trigger/lib/supabase'
import { getOpenAIClient } from '@/trigger/lib/openai'
import type { AnalyzeHomepagePayload, AnalyzeHomepageOutput } from '@/trigger/lib/types'
import { ScrapeWorkflow } from '@/trigger/lib/types'
import { extractEventsTool, identifyCalendarUrlsTool } from '@/trigger/lib/openaiTools'
import { resolveSubUrls } from '@/trigger/lib/urlUtils'
import { homepageSystemPrompt } from '@/prompts'
import type { ExtractedEvent } from '@/types'
import { ExtractedEventSchema } from '@/types'

export const analyzeHomepage = task({
  id: 'analyze-homepage',
  run: async (payload: AnalyzeHomepagePayload): Promise<AnalyzeHomepageOutput> => {
    const { venueId, storageKey, sourceUrl } = payload
    console.log(`[analyze-homepage] START venueId=${venueId} storageKey=${storageKey}`)

    const supabase = getSupabaseClient()
    const openai = getOpenAIClient()

    const { data: fileData, error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storageKey)

    if (storageErr) throw new Error(`Storage download failed: ${storageErr.message}`)

    const markdown = await fileData.text()
    const bytes = markdown.length
    console.log(`[analyze-homepage] calling gpt-4o-mini bytes=${bytes}`)

    const today = new Date().toISOString().split('T')[0]
    const systemPrompt = homepageSystemPrompt(today)

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: markdown },
      ],
      tools:       [extractEventsTool, identifyCalendarUrlsTool],
      tool_choice: 'auto',
    })

    let events: ExtractedEvent[] = []
    let rawSubUrls: string[] = []

    for (const toolCall of completion.choices[0]?.message?.tool_calls ?? []) {
      if (toolCall.function.name === 'extract_events') {
        try {
          const parsed = JSON.parse(toolCall.function.arguments) as { events: unknown[] }
          const raw = parsed.events ?? []
          events = raw.filter((e): e is ExtractedEvent => {
            const result = ExtractedEventSchema.safeParse(e)
            if (!result.success) {
              console.warn('[analyze-homepage] dropping invalid event:', JSON.stringify(e), result.error.flatten())
            }
            return result.success
          })
        } catch {
          console.error('[analyze-homepage] failed to parse extract_events arguments:', toolCall.function.arguments)
          events = []
        }
      } else if (toolCall.function.name === 'identify_calendar_urls') {
        try {
          const parsed = JSON.parse(toolCall.function.arguments) as { urls: string[] }
          rawSubUrls = parsed.urls ?? []
        } catch {
          console.error('[analyze-homepage] failed to parse identify_calendar_urls arguments:', toolCall.function.arguments)
          rawSubUrls = []
        }
      }
    }

    const subUrls = resolveSubUrls(rawSubUrls, sourceUrl)

    console.log(`[analyze-homepage] extracted events=${events.length} subUrls=${subUrls.length}`)

    // Upsert events
    for (const event of events) {
      await supabase.from('events').upsert(
        {
          venue_id:     venueId,
          event_name:   event.event_name,
          artist_name:  event.artist_name,
          date:         event.date,
          time_start:   event.time_start,
          time_end:     event.time_end,
          price_type:   event.price_type,
          price_amount: event.price_amount,
          description:  event.description,
          event_type:   event.event_type,
          source_url:   sourceUrl,
          parsed_at:    new Date().toISOString(),
        },
        { onConflict: 'venue_id,date,event_name' }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sub_urls not yet in generated types
    await (supabase.from('venues') as any)
      .update({ sub_urls: subUrls, scrape_status: 'html_scraped' })
      .eq('id', venueId)

    await supabase.from('scrape_logs').insert({
      venue_id: venueId,
      workflow: ScrapeWorkflow.ANALYZE_HOMEPAGE,
      status:   'success',
    })

    console.log(`[analyze-homepage] DONE eventsUpserted=${events.length}`)
    return { venueId, eventsFound: events.length, subUrls }
  },
})
