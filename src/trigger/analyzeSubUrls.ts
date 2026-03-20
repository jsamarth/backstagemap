import { task } from '@trigger.dev/sdk'
import { getSupabaseClient, STORAGE_BUCKET } from './lib/supabase'
import { getOpenAIClient } from './lib/openai'
import type { AnalyzeSubUrlsPayload, AnalyzeSubUrlsOutput } from './lib/types'
import { ScrapeWorkflow } from './lib/types'
import { extractEventsTool } from './lib/openaiTools'
import { subUrlsSystemPrompt } from '../prompts'
import type { ExtractedEvent } from '../types'

export const analyzeSubUrls = task({
  id: 'analyze-sub-urls',
  run: async (payload: AnalyzeSubUrlsPayload): Promise<AnalyzeSubUrlsOutput> => {
    const { venueId, storageKey, venueUrl } = payload
    console.log(`[analyze-sub-urls] START venueId=${venueId} storageKey=${storageKey}`)

    const supabase = getSupabaseClient()
    const openai = getOpenAIClient()

    const { data: fileData, error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storageKey)

    if (storageErr) throw new Error(`Storage download failed: ${storageErr.message}`)

    const markdown = await fileData.text()
    const bytes = markdown.length
    console.log(`[analyze-sub-urls] calling gpt-4o-mini bytes=${bytes}`)

    const today = new Date().toISOString().split('T')[0]
    const systemPrompt = subUrlsSystemPrompt(today)

    const completion = await openai.chat.completions.create({
      model:       'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: markdown },
      ],
      tools:       [extractEventsTool],
      tool_choice: { type: 'function', function: { name: 'extract_events' } },
    })

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
    if (!toolCall) throw new Error('gpt-4o-mini returned no tool call')

    let events: ExtractedEvent[] = []
    try {
      const parsed = JSON.parse(toolCall.function.arguments) as { events: ExtractedEvent[] }
      events = parsed.events ?? []
    } catch {
      console.error('[analyze-sub-urls] failed to parse tool call arguments:', toolCall.function.arguments)
    }
    console.log(`[analyze-sub-urls] extracted events=${events.length}`)

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
          source_url:   venueUrl,
          parsed_at:    new Date().toISOString(),
        },
        { onConflict: 'venue_id,date,event_name' }
      )
    }

    // Mark venue as fully extracted
    await supabase
      .from('venues')
      .update({
        scrape_status: 'extracted',
        extracted_at:  new Date().toISOString(),
      })
      .eq('id', venueId)

    await supabase.from('scrape_logs').insert({
      venue_id: venueId,
      workflow: ScrapeWorkflow.ANALYZE_SUB_URLS,
      status:   'success',
    })

    console.log(`[analyze-sub-urls] DONE eventsUpserted=${events.length}`)
    return { venueId, eventsFound: events.length }
  },
})
