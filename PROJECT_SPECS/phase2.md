# BackstageMap — Phase 2 Technical Spec

## 1. Overview

Phase 2 activates the live data pipeline. Phase 1 delivered a fully functional app skeleton running against manually seeded dummy data. Phase 2 replaces that dummy data with real, continuously refreshed events scraped from venue websites across NYC.

**What Phase 2 adds:**
- Automated venue discovery via Google Maps Places API
- Nightly HTML scraping of venue calendar pages via Firecrawl
- Daily AI-powered event extraction via GPT-4o (OpenAI function calling)
- Rolling freshness reset to keep data current
- Observability via `scrape_logs` table
- Supabase Storage for raw scraped content

**What Phase 2 is not:**
- No frontend changes (the app already works; Phase 2 just feeds it real data)
- No new auth or bookmark logic
- No real-time scraping on-demand (all workflows are batch/scheduled)

**Success criteria:**
- ≥80% scraping accuracy (correct event name, date, venue on spot-check)
- ≥50 real venues indexed with valid lat/lng and live calendar URLs
- No dummy seed data remaining in production

For product context, see `PROJECT_SPECS/main.md`.

---

## 2. Infrastructure Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Workflow runtime | Vercel Cron Jobs + Next.js API route handlers | Already used for email digest in Phase 1; zero new infrastructure |
| HTML fetching | Firecrawl API | Returns clean markdown; handles JS-rendered pages; no headless browser to manage; fits Vercel's 50MB function bundle limit and 60s timeout. Self-hosted Playwright was considered but ruled out (see below). |
| AI parsing | OpenAI API (`gpt-4o`) | Strong structured JSON extraction via function calling; deterministic at temperature 0; cost-efficient on markdown input |
| Blob storage | Supabase Storage | Already provisioned; no new credentials needed; private bucket for raw scrapes |
| Venue discovery | Google Maps Places API (Text Search) | Most accurate structured place data; includes website URL and lat/lng out of the box |

### Workflow 2 — Scraper: Firecrawl vs. self-hosted Playwright

**Self-hosted Playwright was considered and rejected for this stack.**

Reasons it doesn't work on Vercel:
- Chromium binary is ~170MB. Vercel enforces a 50MB compressed function bundle limit — Playwright cannot be bundled into a serverless function.
- Even with `@sparticuz/chromium` (a slimmed Lambda-compatible build at ~40MB compressed), cold start latency regularly exceeds Vercel's 60s function timeout for a 30-venue batch.
- Would require a separate always-on service (Railway, Render, Fly.io) to host the browser — new infrastructure, new credentials, new failure surface.

**Firecrawl is the right call for Vercel:**
- Pure API call — no binary to bundle.
- Handles JS-rendered pages server-side (uses headless Chrome internally, so no capability gap vs. Playwright).
- Returns clean markdown, which is more token-efficient than raw HTML for the GPT-4o parsing step.
- ~$0.001/page. At 30 venues/night that's ~$0.03/day — negligible.

If Firecrawl ever becomes cost-prohibitive at scale, the right move is to spin up a dedicated scraper service (not inline with Vercel functions).

---

## 3. Database Schema Changes

The Phase 1 migration already establishes the `venues`, `events`, `bookmarks` tables and the `scrape_status` enum with values `not_started`, `html_scraped`, `extracted`. Phase 2 adds three things on top.

### 3a. New columns on `venues`

```sql
ALTER TABLE public.venues
  ADD COLUMN scrape_error     TEXT,                          -- last error message, nullable
  ADD COLUMN scrape_fail_count INT NOT NULL DEFAULT 0;       -- consecutive failure count
```

`calendar_url` already exists from the Phase 1 migration. No migration needed for it.

### 3b. New `scrape_logs` table

```sql
CREATE TABLE public.scrape_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID        REFERENCES public.venues(id) ON DELETE CASCADE,  -- nullable for batch-level logs
  workflow   TEXT        NOT NULL,  -- 'discovery' | 'html_scrape' | 'ai_parse' | 'freshness_reset'
  status     TEXT        NOT NULL,  -- 'success' | 'failure'
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX scrape_logs_venue_created_idx ON public.scrape_logs (venue_id, created_at DESC);
CREATE INDEX scrape_logs_workflow_created_idx ON public.scrape_logs (workflow, created_at DESC);
```

### 3c. Stale event cleanup

A nightly cleanup deletes past events automatically. This runs as part of the `html-scrape` cron or as a standalone statement:

```sql
DELETE FROM public.events WHERE date < CURRENT_DATE - 1;
```

---

## 4. Supabase Storage Setup

Create a private bucket named `html-scrapes`:

```
Bucket name:    html-scrapes
Public access:  OFF (service role only)
File path:      {venue_id}/{ISO-timestamp}.md
CDN/caching:    OFF (raw scrape content; not served to users)
```

Files are written by the html-scrape workflow and read by the ai-parse workflow. No public URLs are generated. Access is via `supabase.storage.from('html-scrapes')` using the service role key.

---

## 5. Workflow 1 — Venue Discovery

**Purpose:** Find real NYC music venues and add them to the `venues` table.

**Cron:** Weekly, Mondays at 10:00 UTC (5am ET)
```
0 10 * * 1
```
**Route:** `GET /api/cron/venue-discovery`

### Logic

```
for each of the 7 neighborhoods:
  for each search query in ["live music bar", "music venue", "jazz bar", "rock bar", "dj bar"]:
    call Google Maps Places Text Search API with:
      query: "{search_query} in {neighborhood}, NYC"
      fields: place_id, name, formatted_address, geometry.location, website
    await 200ms  // rate limiting
    for each result:
      if google_maps_venue_id already exists in venues → skip
      infer calendar_url:
        try {website_url}/events, /calendar, /shows in sequence
        store best guess (first non-404 from a HEAD request, or /events as fallback)
      insert into venues:
        name, address, neighborhood, latitude, longitude,
        google_maps_venue_id, website_url, calendar_url,
        scrape_status = 'not_started'
      insert scrape_logs row: workflow='discovery', status='success'
    on API error: insert scrape_logs row: workflow='discovery', status='failure', error=message
```

### Rate limiting

- 200ms delay between Places API calls (`setTimeout(resolve, 200)`)
- Places Text Search: 10 QPS limit; 200ms delay keeps us well under
- Total queries: 7 neighborhoods × 5 queries = 35 calls per weekly run

### Environment variable required

```
GOOGLE_MAPS_API_KEY=<key>   # Places API must be enabled in Google Cloud Console
```

### Response shape

```
HTTP 200 { inserted: number, skipped: number, errors: number }
HTTP 401 if CRON_SECRET header missing/invalid
HTTP 500 on unhandled error
```

---

## 6. Workflow 2 — Nightly HTML Scraping

**Purpose:** Fetch and store the raw calendar page content for venues ready to scrape.

**Cron:** Nightly at 07:00 UTC (2am ET)
```
0 7 * * *
```
**Route:** `GET /api/cron/html-scrape`

### Logic

```
1. Delete stale events: DELETE FROM events WHERE date < CURRENT_DATE - 1

2. Query up to 30 venues WHERE scrape_status = 'not_started'
   ORDER BY last_scraped_at ASC NULLS FIRST

3. For each venue (process sequentially; do not let one failure block others):
   a. target_url = calendar_url ?? website_url
   b. Call Firecrawl API:
        POST https://api.firecrawl.dev/v1/scrape
        { url: target_url, formats: ["markdown"] }
   c. If success:
        Upload markdown to Supabase Storage:
          path: html-scrapes/{venue_id}/{new Date().toISOString()}.md
        Update venues:
          raw_html_url = storage path
          last_scraped_at = NOW()
          scrape_status = 'html_scraped'
          scrape_error = NULL
        Insert scrape_logs: workflow='html_scrape', status='success', venue_id
   d. If failure:
        Update venues:
          scrape_error = error.message
          scrape_fail_count = scrape_fail_count + 1
          if scrape_fail_count >= 5: scrape_status = 'failed'  -- excluded from future cycles
        Insert scrape_logs: workflow='html_scrape', status='failure', venue_id, error=message

4. Insert batch summary to scrape_logs:
   workflow='html_scrape', status='success', venue_id=null,
   error=null (or summary string with counts)
```

### Firecrawl request shape

```ts
POST https://api.firecrawl.dev/v1/scrape
Authorization: Bearer {FIRECRAWL_API_KEY}
Content-Type: application/json

{
  "url": "https://venue-website.com/events",
  "formats": ["markdown"],
  "onlyMainContent": true
}
```

Response: `{ success: true, data: { markdown: string, metadata: {...} } }`

### Timeout & concurrency

- Process venues **sequentially** (not parallel) to stay within Vercel's 60s function timeout
- 30 venues × ~1.5s per Firecrawl call ≈ 45s total; within limit
- If more throughput is needed: process in batches of 5 with `Promise.allSettled`

### `scrape_status = 'failed'` semantics

Venues with `scrape_fail_count >= 5` have `scrape_status` set to `'failed'`. They are excluded from all future nightly batches. Manual review required to re-enable (reset `scrape_fail_count = 0` and `scrape_status = 'not_started'`).

### Environment variable required

```
FIRECRAWL_API_KEY=<key>
```

### Response shape

```
HTTP 200 { scraped: number, failed: number, skipped: number }
HTTP 401 if CRON_SECRET header missing/invalid
```

---

## 7. Workflow 3 — Daily AI Parsing

**Purpose:** Extract structured event data from raw scraped markdown using GPT-4o.

**Cron:** Daily at 08:00 UTC (3am ET), 1 hour after Workflow 2
```
0 8 * * *
```
**Route:** `GET /api/cron/ai-parse`

### Logic

```
1. Query all venues WHERE scrape_status = 'html_scraped'

2. For each venue:
   a. Download markdown from Supabase Storage at raw_html_url
   b. Call OpenAI Chat Completions API:
        model: gpt-4o
        temperature: 0
        messages: [system, user]
        tools: [extract_events function]
   c. Parse tool call arguments → array of event objects
   d. Upsert each event into events table:
        ON CONFLICT (venue_id, date, event_name) DO UPDATE
          SET artist_name, time_start, time_end, price_type,
              price_amount, description, event_type, parsed_at = NOW()
   e. Update venues:
        scrape_status = 'extracted'
        extracted_at = NOW()
   f. Insert scrape_logs: workflow='ai_parse', status='success', venue_id
   g. On failure: insert scrape_logs: workflow='ai_parse', status='failure', venue_id, error
```

### OpenAI prompt

**System message:**
```
You are a structured data extractor. Today's date is {TODAY_YYYY_MM_DD}.
Extract all upcoming music events from the provided venue calendar page.
Return only events with dates on or after today. Omit past events.
If a field is not present in the source material, return null for that field.
```

**User message:**
```
{markdown content downloaded from Supabase Storage}
```

### OpenAI function schema (tool use)

```json
{
  "type": "function",
  "function": {
    "name": "extract_events",
    "description": "Extract all upcoming music events from the venue calendar page",
    "parameters": {
      "type": "object",
      "required": ["events"],
      "properties": {
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["event_name", "date", "event_type", "price_type"],
            "properties": {
              "event_name":   { "type": "string" },
              "artist_name":  { "type": ["string", "null"] },
              "date":         { "type": "string", "description": "YYYY-MM-DD" },
              "time_start":   { "type": ["string", "null"], "description": "HH:MM 24-hour" },
              "time_end":     { "type": ["string", "null"], "description": "HH:MM 24-hour" },
              "price_type":   { "type": "string", "enum": ["free", "cover", "ticketed"] },
              "price_amount": { "type": ["number", "null"] },
              "description":  { "type": ["string", "null"] },
              "event_type":   { "type": "string", "enum": ["live_band", "dj", "open_mic", "jam_session"] }
            }
          }
        }
      }
    }
  }
}
```

### Cost estimate

- Typical venue calendar page in markdown: ~2,000–5,000 tokens
- GPT-4o pricing: ~$0.0025/1K input tokens, ~$0.01/1K output tokens
- Per venue: ~$0.01–$0.05 depending on calendar page length
- 50 venues/day: ~$0.50–$2.50/day

### Environment variable required

```
OPENAI_API_KEY=<key>
```

### Response shape

```
HTTP 200 { parsed: number, events_upserted: number, errors: number }
HTTP 401 if CRON_SECRET header missing/invalid
```

---

## 8. Workflow 4 — Freshness Reset

**Purpose:** Cycle venues back to `not_started` so they get re-scraped with fresh data.

**Cron:** Every 5 days at 06:00 UTC
```
0 6 */5 * *
```
**Route:** `GET /api/cron/freshness-reset`

### Logic

```
1. Select up to 50 venues WHERE scrape_status = 'extracted'
   ORDER BY extracted_at ASC  -- oldest first

2. Set scrape_status = 'not_started' for selected rows

3. Insert scrape_logs: workflow='freshness_reset', status='success',
   venue_id=null, error="{count} venues reset"
```

Existing events for reset venues remain live on the map until the next extraction cycle replaces them.

### Response shape

```
HTTP 200 { reset: number }
HTTP 401 if CRON_SECRET header missing/invalid
```

---

## 9. Cron Auth Pattern

All cron routes use the same authorization pattern as the Phase 1 email digest:

```ts
// At the top of every cron route handler:
const authHeader = request.headers.get('Authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

Vercel sets the `Authorization: Bearer {CRON_SECRET}` header automatically on cron invocations when `CRON_SECRET` is set in the project environment variables.

---

## 10. `vercel.json` — Updated Cron Schedule

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/venue-discovery",
      "schedule": "0 10 * * 1"
    },
    {
      "path": "/api/cron/html-scrape",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/cron/ai-parse",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/freshness-reset",
      "schedule": "0 6 */5 * *"
    }
  ]
}
```

---

## 11. Route Handler Shapes

### `app/api/cron/venue-discovery/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NEIGHBORHOODS = [
  'Williamsburg', 'Bushwick', 'Bed-Stuy',
  'East Village', 'West Village', 'Chelsea', 'Greenpoint'
]
const QUERIES = ['live music bar', 'music venue', 'jazz bar', 'rock bar', 'dj bar']

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let inserted = 0, skipped = 0, errors = 0

  for (const neighborhood of NEIGHBORHOODS) {
    for (const query of QUERIES) {
      await new Promise(r => setTimeout(r, 200))  // rate limiting
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json` +
          `?query=${encodeURIComponent(`${query} in ${neighborhood}, NYC`)}` +
          `&key=${process.env.GOOGLE_MAPS_API_KEY}`
        )
        const data = await res.json()

        for (const place of data.results ?? []) {
          const { data: existing } = await supabase
            .from('venues')
            .select('id')
            .eq('google_maps_venue_id', place.place_id)
            .single()

          if (existing) { skipped++; continue }

          const websiteUrl = place.website ?? null
          const calendarUrl = websiteUrl ? `${websiteUrl.replace(/\/$/, '')}/events` : null

          const { error } = await supabase.from('venues').insert({
            name: place.name,
            address: place.formatted_address,
            neighborhood: neighborhood.toLowerCase().replace(/[- ]/g, '_') as any,
            venue_type: 'bar' as any,  // default; can be refined later
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            google_maps_venue_id: place.place_id,
            website_url: websiteUrl,
            calendar_url: calendarUrl,
            scrape_status: 'not_started' as any,
          })

          if (error) {
            errors++
            await supabase.from('scrape_logs').insert({
              workflow: 'discovery', status: 'failure', error: error.message
            })
          } else {
            inserted++
            await supabase.from('scrape_logs').insert({
              workflow: 'discovery', status: 'success'
            })
          }
        }
      } catch (err: any) {
        errors++
        await supabase.from('scrape_logs').insert({
          workflow: 'discovery', status: 'failure', error: err.message
        })
      }
    }
  }

  return NextResponse.json({ inserted, skipped, errors })
}
```

### `app/api/cron/html-scrape/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Prune stale events
  await supabase.rpc('delete_past_events')  // or raw SQL via supabase.from()

  const { data: venues } = await supabase
    .from('venues')
    .select('id, calendar_url, website_url, scrape_fail_count')
    .eq('scrape_status', 'not_started')
    .order('last_scraped_at', { ascending: true, nullsFirst: true })
    .limit(30)

  let scraped = 0, failed = 0

  for (const venue of venues ?? []) {
    const targetUrl = venue.calendar_url ?? venue.website_url
    if (!targetUrl) { failed++; continue }

    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: targetUrl, formats: ['markdown'], onlyMainContent: true }),
      })
      const data = await res.json()

      if (!data.success) throw new Error(data.error ?? 'Firecrawl failed')

      const timestamp = new Date().toISOString()
      const storagePath = `${venue.id}/${timestamp}.md`

      await supabase.storage
        .from('html-scrapes')
        .upload(storagePath, data.data.markdown, { contentType: 'text/markdown' })

      await supabase.from('venues').update({
        raw_html_url: storagePath,
        last_scraped_at: new Date().toISOString(),
        scrape_status: 'html_scraped',
        scrape_error: null,
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id, workflow: 'html_scrape', status: 'success'
      })
      scraped++
    } catch (err: any) {
      const newFailCount = (venue.scrape_fail_count ?? 0) + 1
      await supabase.from('venues').update({
        scrape_error: err.message,
        scrape_fail_count: newFailCount,
        ...(newFailCount >= 5 ? { scrape_status: 'failed' as any } : {}),
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id, workflow: 'html_scrape', status: 'failure', error: err.message
      })
      failed++
    }
  }

  return NextResponse.json({ scraped, failed, skipped: 0 })
}
```

### `app/api/cron/ai-parse/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
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
              time_start:   { type: ['string', 'null'], description: 'HH:MM 24-hour' },
              time_end:     { type: ['string', 'null'], description: 'HH:MM 24-hour' },
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

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: venues } = await supabase
    .from('venues')
    .select('id, raw_html_url')
    .eq('scrape_status', 'html_scraped')

  let parsed = 0, eventsUpserted = 0, errors = 0
  const today = new Date().toISOString().split('T')[0]

  for (const venue of venues ?? []) {
    if (!venue.raw_html_url) { errors++; continue }

    try {
      const { data: fileData, error: storageErr } = await supabase.storage
        .from('html-scrapes')
        .download(venue.raw_html_url)
      if (storageErr) throw storageErr

      const markdown = await fileData.text()

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a structured data extractor. Today's date is ${today}. Extract all upcoming music events from the provided venue calendar page. Return only events with dates on or after today.`,
          },
          { role: 'user', content: markdown },
        ],
        tools: [extractEventsTool],
        tool_choice: { type: 'function', function: { name: 'extract_events' } },
      })

      const toolCall = completion.choices[0]?.message?.tool_calls?.[0]
      if (!toolCall) throw new Error('No tool call returned')

      const { events } = JSON.parse(toolCall.function.arguments) as {
        events: Array<{
          event_name: string
          artist_name: string | null
          date: string
          time_start: string | null
          time_end: string | null
          price_type: 'free' | 'cover' | 'ticketed'
          price_amount: number | null
          description: string | null
          event_type: 'live_band' | 'dj' | 'open_mic' | 'jam_session'
        }>
      }

      for (const event of events) {
        const { error } = await supabase.from('events').upsert(
          {
            venue_id: venue.id,
            event_name: event.event_name,
            artist_name: event.artist_name,
            date: event.date,
            time_start: event.time_start,
            time_end: event.time_end,
            price_type: event.price_type,
            price_amount: event.price_amount,
            description: event.description,
            event_type: event.event_type,
            parsed_at: new Date().toISOString(),
            source_url: null,
          },
          { onConflict: 'venue_id,date,event_name' }
        )
        if (!error) eventsUpserted++
      }

      await supabase.from('venues').update({
        scrape_status: 'extracted',
        extracted_at: new Date().toISOString(),
      }).eq('id', venue.id)

      await supabase.from('scrape_logs').insert({
        venue_id: venue.id, workflow: 'ai_parse', status: 'success'
      })
      parsed++
    } catch (err: any) {
      await supabase.from('scrape_logs').insert({
        venue_id: venue.id, workflow: 'ai_parse', status: 'failure', error: err.message
      })
      errors++
    }
  }

  return NextResponse.json({ parsed, events_upserted: eventsUpserted, errors })
}
```

### `app/api/cron/freshness-reset/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .eq('scrape_status', 'extracted')
    .order('extracted_at', { ascending: true })
    .limit(50)

  const ids = (venues ?? []).map(v => v.id)

  if (ids.length > 0) {
    await supabase
      .from('venues')
      .update({ scrape_status: 'not_started' })
      .in('id', ids)
  }

  await supabase.from('scrape_logs').insert({
    workflow: 'freshness_reset',
    status: 'success',
    error: `${ids.length} venues reset`,
  })

  return NextResponse.json({ reset: ids.length })
}
```

---

## 12. Error Handling & Observability

### Dead venue detection

Venues with `scrape_fail_count >= 5` are set to `scrape_status = 'failed'` (see Workflow 2 logic). They are excluded from nightly batches indefinitely. To surface failed venues for review:

```sql
SELECT id, name, website_url, scrape_error, scrape_fail_count
FROM venues
WHERE scrape_status = 'failed'
ORDER BY scrape_fail_count DESC;
```

To re-enable a dead venue after fixing its calendar URL:

```sql
UPDATE venues
SET scrape_status = 'not_started', scrape_fail_count = 0, scrape_error = NULL
WHERE id = '<venue_id>';
```

### Monitoring failure rates

```sql
-- Failure rate by workflow for last 7 days
SELECT
  workflow,
  COUNT(*) FILTER (WHERE status = 'success') AS successes,
  COUNT(*) FILTER (WHERE status = 'failure') AS failures,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'failure') / COUNT(*),
    1
  ) AS failure_pct
FROM scrape_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY workflow;
```

Target: `html_scrape` failure rate < 20% per nightly batch.

### Alerting

No automated alerting in Phase 2. Manual review via the `scrape_logs` query above. Phase 3 can add Slack/PagerDuty alerts if failure rates exceed thresholds.

---

## 13. New Environment Variables

Add to `.env.example` and set in Vercel project settings:

```bash
# Google Maps Places API (billing must be enabled in Google Cloud Console)
GOOGLE_MAPS_API_KEY=

# Firecrawl — https://firecrawl.dev
FIRECRAWL_API_KEY=

# OpenAI — GPT-4o for AI parsing
OPENAI_API_KEY=

# Supabase Storage bucket name for raw scraped HTML
SCRAPE_STORAGE_BUCKET=html-scrapes
```

All Phase 1 variables remain unchanged.

---

## 14. Package Dependencies

```bash
pnpm add openai        # OpenAI SDK for GPT-4o function calling
```

Firecrawl and Google Maps are called via `fetch` directly (no SDK needed). No additional packages required.

---

## 15. Phase 2 Definition of Done

- [ ] Migration applied: `scrape_error`, `scrape_fail_count` columns exist on `venues`; `scrape_logs` table exists with correct indexes
- [ ] Supabase Storage bucket `html-scrapes` created as private
- [ ] Workflow 1 runs end-to-end: `venue-discovery` cron inserts ≥20 new real venues with valid lat/lng
- [ ] Workflow 2 runs end-to-end: `html-scrape` cron processes a 30-venue batch with ≥80% success (≥24/30 scraped)
- [ ] Workflow 3 runs end-to-end: `ai-parse` cron extracts events from scraped markdown; events appear on the live map
- [ ] Workflow 4 runs end-to-end: `freshness-reset` cron resets EXTRACTED venues; they re-enter the scrape cycle
- [ ] `scrape_logs` rows are written for every workflow run (success and failure)
- [ ] Quality gate: spot-check 25 events from ≥5 different venues; ≥20/25 have correct event name, date, and venue
- [ ] No dummy seed data remains in production; all events have real `source_url` values (not `placeholder.backstagemap.dev`)
- [ ] Venues with `scrape_fail_count >= 5` have `scrape_status = 'failed'` and do not appear in nightly batch
- [ ] All 4 new cron routes return 401 for requests without the correct `CRON_SECRET` header
- [ ] `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `GOOGLE_MAPS_API_KEY` are set as Vercel environment variables (not committed to repo)
