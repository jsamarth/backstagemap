# BackstageMap — Phase 1 Technical Spec

## 1. Overview

Phase 1 delivers a fully functional app skeleton running end-to-end against manually seeded dummy data. The goal is to prove every user-facing flow works — map, filters, auth, bookmarks, email digest — before any scraping or AI parsing infrastructure is built.

**What Phase 1 is:**
- Complete UI (map view, bookmarks view, auth pages, email subscribe)
- All API endpoints wired to a real Postgres database
- Auth (email/password + Google OAuth) via Supabase
- Nightly email digest via Resend
- ~490–700 dummy events seeded across 7 NYC neighborhoods

**What Phase 1 is not:**
- No scraping workflows
- No AI parsing pipelines
- No venue data ingestion from external sources
- All data is manually seeded via `db/seed.ts`; no live data arrives in Phase 1

For product context, see the main spec.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Full-stack: React frontend + API routes in one repo; Vercel-native deployment |
| Language | TypeScript | Everywhere: frontend, API routes, DB queries, seed script |
| UI Generation | v0 (Vercel) | AI-generated React/Tailwind components as the starting point |
| Map | Mapbox GL JS via `react-map-gl` | Best-in-class map UX; generous free tier |
| Styling | Tailwind CSS | v0 outputs Tailwind; consistent design system |
| Database | Supabase Postgres + PostGIS | Managed Postgres; PostGIS available as a one-click extension |
| DB Client | Supabase JS client (`@supabase/supabase-js`) | Type-safe queries; Supabase-native. Raw SQL via `supabase.rpc()` for PostGIS distance queries |
| Auth | Supabase Auth | Email/password + Google OAuth built in; integrates with Next.js via `@supabase/ssr` |
| Email | Resend + React Email | Modern email API, React-based templates, generous free tier |
| Hosting — App | Vercel | Zero-config Next.js deployment |
| Hosting — DB/Auth | Supabase | Managed Postgres + Auth in one platform |
| Package manager | pnpm | Fast, disk-efficient |

---

## 3. Repository & Project Structure

```
backstagemap/
├── app/                          # Next.js App Router pages
│   ├── page.tsx                  # Map view (root)
│   ├── saved/page.tsx            # Bookmarks view
│   ├── auth/
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   └── api/
│       ├── events/route.ts
│       ├── events/[id]/route.ts
│       ├── bookmarks/route.ts
│       ├── bookmarks/[eventId]/route.ts
│       ├── subscriptions/route.ts
│       └── auth/[...nextauth]/route.ts
├── components/
│   ├── Map.tsx
│   ├── EventPin.tsx
│   ├── EventDetailCard.tsx
│   ├── FilterBar.tsx
│   ├── BookmarkButton.tsx
│   └── EmailSubscribeForm.tsx
├── db/
│   ├── schema.ts                 # Drizzle schema definitions
│   ├── index.ts                  # DB client
│   └── seed.ts                   # Seed script (dummy data)
├── lib/
│   ├── auth.ts                   # Supabase auth helpers
│   └── email.ts                  # Resend client + digest logic
├── emails/
│   └── DigestEmail.tsx           # React Email template
├── middleware.ts                 # Supabase session refresh
├── drizzle.config.ts
└── .env.local
```

---

## 4. Database Schema

### 4a. Core Tables

#### `venues`

```sql
CREATE TABLE venues (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  address             TEXT NOT NULL,
  neighborhood        TEXT NOT NULL,
  venue_type          TEXT NOT NULL,           -- 'bar' | 'performance_venue' | 'cafe' | 'club' | 'park'
  location            GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS point
  google_maps_venue_id TEXT,                   -- nullable; fake/null for seed data
  website             TEXT,
  instagram_handle    TEXT,
  phone               TEXT,
  scrape_status       TEXT NOT NULL DEFAULT 'EXTRACTED',  -- 'PENDING' | 'EXTRACTED' | 'FAILED'
  extracted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seed rows: `scrape_status = 'EXTRACTED'`, `extracted_at = NOW()` at seed time. `google_maps_venue_id` is null.

#### `events`

```sql
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL,
  artist_name   TEXT,
  date          DATE NOT NULL,
  time_start    TIME,
  time_end      TIME,
  price_type    TEXT NOT NULL,                 -- 'free' | 'cover' | 'ticketed'
  price_amount  NUMERIC(8, 2),                 -- null if free
  description   TEXT,
  type          TEXT NOT NULL,                 -- 'rock' | 'folk' | 'jazz' | 'DJ' | 'open-mic' | 'jam' | 'electronic'
  recurring     BOOLEAN NOT NULL DEFAULT FALSE,
  source_url    TEXT NOT NULL,
  parsed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seed rows: `source_url = 'https://placeholder.backstagemap.dev/venues/{venue_id}'`.

### 4b. New Tables

#### `profiles`

Extends Supabase `auth.users`. A database trigger auto-inserts a row on every new `auth.users` insert.

```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Trigger:**

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

#### `bookmarks`

```sql
CREATE TABLE bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);
```

#### `email_subscriptions`

```sql
CREATE TYPE price_filter_enum AS ENUM ('all', 'free', 'paid');

CREATE TABLE email_subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL UNIQUE,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- nullable; null for non-account subscribers
  neighborhoods        TEXT[] NOT NULL DEFAULT '{}',   -- empty = all neighborhoods
  event_types          TEXT[] NOT NULL DEFAULT '{}',   -- empty = all types
  price_filter         price_filter_enum NOT NULL DEFAULT 'all',
  unsubscribe_token    TEXT NOT NULL UNIQUE,
  last_digest_sent_at  TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4c. Indexes

```sql
-- PostGIS distance/bounding-box queries
CREATE INDEX venues_location_gist ON venues USING GIST (location);

-- FK join performance
CREATE INDEX events_venue_id_idx ON events (venue_id);

-- Date range filtering
CREATE INDEX events_date_idx ON events (date);

-- Bookmarks: unique constraint creates this implicitly, but explicit for clarity
CREATE UNIQUE INDEX bookmarks_user_event_idx ON bookmarks (user_id, event_id);

-- Unsubscribe token lookups
CREATE INDEX email_subscriptions_token_idx ON email_subscriptions (unsubscribe_token);
```

---

## 5. Database Seed Requirements

Phase 1 is entirely driven by `db/seed.ts`, run once before launch. **No scraping occurs in Phase 1.**

### Volume targets

| Metric | Target |
|---|---|
| Total venues | 70 (10 per neighborhood × 7 neighborhoods) |
| Total events | 490–700 (7–10 per venue) |
| Date range | Next 30 days from seed date + a handful from the past week |

### 7 Neighborhoods

Lower East Side, Williamsburg, East Village, Bushwick, Harlem, Crown Heights, Astoria

### Data variety requirements

| Dimension | Requirement |
|---|---|
| Event types | Mix of `rock`, `folk`, `jazz`, `DJ`, `open-mic`, `jam`, `electronic` — no single type > 35% of total |
| Price | ≥30% free; remainder split between cover ($5–$20) and ticketed ($15–$40) |
| Time of day | Mix across afternoon (2pm–5pm), evening (6pm–9pm), late night (9pm+) |
| Recurring | ~20% of events have `recurring = true` |
| Venue types | Mix of `bar`, `performance_venue`, `cafe`, `club` — no `park` venues in Phase 1 |

### Data quality requirements

- All venues have realistic NYC addresses with accurate lat/lng for their neighborhood (correct PostGIS geometry)
- `scrape_status = 'EXTRACTED'` and `extracted_at = NOW()` for all seeded venues
- `source_url` on events = `https://placeholder.backstagemap.dev/venues/{venue_id}`
- Venue names are plausible but fictional (e.g., "The Clockwork Lounge", "Neon Sparrow", "Brass & Bone") — not real venues, to avoid confusion

### Seed script behavior

- **Idempotent:** upsert on `(name, neighborhood)` for venues; upsert on `(venue_id, date, event_name)` for events — running twice produces no duplicates
- **Summary log on completion:**
  ```
  Seed complete.
  Venues inserted: 70
  Events inserted: 623
  Neighborhoods covered: 7 / 7
  ```

---

## 6. Backend — API Routes

All routes live under `app/api/`. Response format: JSON. Errors return `{ error: string }` with the appropriate HTTP status code.

### GET /api/events

Query events with optional filters.

**Query parameters:**

| Param | Type | Notes |
|---|---|---|
| `lat` | number | User latitude; required for distance sort |
| `lng` | number | User longitude; required for distance sort |
| `date` | string | `'today'` \| `'tomorrow'` \| `'weekend'` \| `'YYYY-MM-DD'` |
| `neighborhoods` | string | Comma-separated neighborhood names |
| `types` | string | Comma-separated event types |
| `price` | string | `'all'` \| `'free'` \| `'paid'` |
| `time_of_day` | string | `'afternoon'` \| `'evening'` \| `'late_night'` |

**Response:** Array of event objects, sorted by distance ASC if `lat`/`lng` provided, else by `date` ASC.

**Query logic:**
- Joins `events` → `venues`
- Distance sort: `ORDER BY venues.location <-> ST_SetSRID(ST_MakePoint($lng, $lat), 4326)`
- `date = 'today'` → `events.date = CURRENT_DATE`
- `date = 'tomorrow'` → `events.date = CURRENT_DATE + 1`
- `date = 'weekend'` → `events.date BETWEEN next_saturday AND next_sunday`
- `time_of_day = 'afternoon'` → `time_start BETWEEN '14:00' AND '17:00'`
- `time_of_day = 'evening'` → `time_start BETWEEN '18:00' AND '21:00'`
- `time_of_day = 'late_night'` → `time_start >= '21:00'`
- `price = 'free'` → `price_type = 'free'`
- `price = 'paid'` → `price_type IN ('cover', 'ticketed')`

**Response shape per event:**

```ts
{
  id: string
  event_name: string
  artist_name: string | null
  date: string           // YYYY-MM-DD
  time_start: string | null
  time_end: string | null
  price_type: 'free' | 'cover' | 'ticketed'
  price_amount: number | null
  description: string | null
  type: string
  source_url: string
  venue: {
    id: string
    name: string
    address: string
    neighborhood: string
    venue_type: string
    lat: number
    lng: number
  }
  distance_meters: number | null  // null if no lat/lng provided
}
```

---

### GET /api/events/[id]

Returns a single event by ID. Same shape as individual items in GET /api/events.

- **200** — event found
- **404** — `{ error: "Event not found" }`

---

### POST /api/bookmarks

**Auth required.**

**Body:** `{ event_id: string }`

Upserts a bookmark for the authenticated user.

- **201** — `{ id, event_id, created_at }`
- **409** — `{ error: "Already bookmarked" }`
- **401** — `{ error: "Unauthorized" }` if no session

---

### GET /api/bookmarks

**Auth required.**

Returns array of bookmarked events (same shape as GET /api/events items) for the authenticated user, sorted by `bookmarks.created_at` DESC.

- **200** — array (empty array if none)
- **401** — `{ error: "Unauthorized" }`

---

### DELETE /api/bookmarks/[eventId]

**Auth required.**

Deletes the bookmark for the authenticated user + event ID pair.

- **204** — deleted
- **404** — `{ error: "Bookmark not found" }`
- **401** — `{ error: "Unauthorized" }`

---

### POST /api/subscriptions

**Body:**

```ts
{
  email: string
  neighborhoods?: string[]   // omit or [] = all neighborhoods
  event_types?: string[]     // omit or [] = all types
  price_filter?: 'all' | 'free' | 'paid'  // default: 'all'
}
```

Creates a new email subscription. Generates a random `unsubscribe_token`. Sends a confirmation email via Resend.

- **201** — `{ id }`
- **409** — `{ error: "Email already subscribed" }`
- **400** — `{ error: "Invalid email" }`

---

### DELETE /api/subscriptions

**Query param:** `token` (the unsubscribe token)

Deletes the matching subscription.

- **204** — deleted
- **404** — `{ error: "Token not found" }`

---

### Auth routes

Handled by Supabase Auth via `@supabase/ssr`. No custom route logic needed for Phase 1. The `/api/auth/[...nextauth]` placeholder in the file tree is for reference; actual auth is managed by Supabase's built-in endpoints.

---

## 7. Auth

**Library:** Supabase Auth via `@supabase/ssr` (Next.js App Router integration)

### Providers

1. **Email + Password** — Supabase's built-in email auth. Sign-up sends a confirmation email via Supabase's SMTP. Sign-in validates against `auth.users`.
2. **Google OAuth** — configured in the Supabase dashboard under Authentication > Providers. On first sign-in, Supabase creates an `auth.users` row; the DB trigger auto-creates the matching `profiles` row.

### Session strategy

- Supabase manages sessions via `@supabase/ssr` cookies on the server and `createBrowserClient` on the client
- `middleware.ts` refreshes the session token on every request using `createServerClient`
- No custom JWT logic — Supabase handles token refresh automatically

### Supabase client patterns

| Context | Pattern |
|---|---|
| Server Components / API Routes | `createServerClient(url, anonKey, { cookies })` from `@supabase/ssr` |
| Client Components | `createBrowserClient(url, anonKey)` from `@supabase/ssr` |
| Seed script / cron (bypasses RLS) | `createClient(url, serviceRoleKey)` from `@supabase/supabase-js` |

### Row Level Security (RLS)

| Table | RLS | Policy |
|---|---|---|
| `bookmarks` | Enabled | Users can only read/write their own rows: `auth.uid() = user_id` |
| `profiles` | Enabled | Users can read/update their own row only: `auth.uid() = id` |
| `events` | Disabled | Public read; service role for writes |
| `venues` | Disabled | Public read; service role for writes |
| `email_subscriptions` | Disabled | Service role for all writes; no direct client access |

### Protected routes

- `/saved` — `middleware.ts` redirects to `/auth/sign-in` if no active Supabase session
- `POST /api/bookmarks`, `GET /api/bookmarks`, `DELETE /api/bookmarks/[eventId]` — return 401 if `supabase.auth.getUser()` returns null user

### Auth UI

- `/auth/sign-in` — email + password form + "Sign in with Google" button + link to sign-up
- `/auth/sign-up` — email + password + name form + "Sign up with Google" button + link to sign-in
- Auth pages are full-page (not modal) for Phase 1 simplicity
- UI shells generated via v0, then wired to Supabase Auth server actions

---

## 8. Frontend

> UI components are generated via **v0** (Vercel's AI UI tool), which outputs React + Tailwind. Each component below is a v0 prompt target — generate the shell, then wire it to real data and Supabase Auth.

### Page structure

| Route | Description | Auth required |
|---|---|---|
| `/` | Map view | No |
| `/saved` | Bookmarks list | Yes → redirect to `/auth/sign-in` |
| `/auth/sign-in` | Sign-in form | No |
| `/auth/sign-up` | Sign-up form | No |

---

### Map View (`/`)

#### Components

**`<Map>`**
- Mapbox GL JS map via `react-map-gl`
- On load: call `navigator.geolocation.getCurrentPosition()`
  - If granted: center on user location; fetch events with user lat/lng
  - If denied: center on NYC center (`[-73.9857, 40.7484]`); fetch events without lat/lng
- Renders `<EventPin>` for each event in the result set
- Map viewport is user-controlled (pan/zoom freely); does NOT re-center on filter change

**`<EventPin>`**
- Colored circle marker; color by event `type`:
  - `rock` / `folk` / `jazz` / live → blue
  - `DJ` / `electronic` → purple
  - `open-mic` → green
  - `jam` → orange
- On click: fetch `GET /api/events/:id`, open `<EventDetailCard>`

**`<FilterBar>`**
- Sticky bar below the header, always visible
- Controls:
  1. **Date:** segmented control — Today | Tomorrow | This Weekend | Pick Date
  2. **Neighborhoods:** multi-select dropdown — all 7 neighborhoods; default = all selected
  3. **Event type:** multi-select chips — Live Music | DJ | Open Mic | Jam Session; default = all
  4. **Price:** radio group — All | Free | Paid; default = All
  5. **Time of day:** multi-select chips — Afternoon | Evening | Late Night; default = all
- "Clear filters" link resets all to defaults
- On any change: re-fetch `GET /api/events` with updated query params; replace pins on map

**`<EventDetailCard>`**
- Slide-up panel or right drawer, appears on pin click; dismissible via close button or clicking outside
- Contents:
  - Event name (large)
  - Artist name (if present)
  - Venue name + neighborhood
  - Date + time range
  - Price label (e.g., "Free" / "Cover: $10" / "Ticketed: $20")
  - Description (if present)
  - "View on venue site →" link — opens `source_url` in new tab
  - Bookmark button:
    - Logged in: filled/outlined toggle; calls POST or DELETE /api/bookmarks
    - Not logged in: shows "Log in to save events" with link to `/auth/sign-in`
  - Close button (X)

---

### Bookmarks View (`/saved`)

- Header: "Saved Events"
- List of bookmarked events in card layout (no map)
- Each card: event name, artist, venue name, date, time, price, remove button (X)
  - Remove button calls `DELETE /api/bookmarks/[eventId]`; removes card from list immediately (optimistic update)
- Empty state: "Nothing saved yet. Explore the map to find events." with link to `/`

---

### Email Subscribe Form (`<EmailSubscribeForm>`)

- Appears in the site footer on all pages
- Fields:
  - Email address input
  - Checkbox group: neighborhood preferences (optional; unchecked = all neighborhoods)
- Submit button: "Get weekly events"
- On success (201): inline confirmation — "You're subscribed! Check your inbox."
- On 409: inline error — "This email is already subscribed."
- On validation error: inline error — "Please enter a valid email address."

---

## 9. Email Digest

**Service:** Resend
**Template:** `emails/DigestEmail.tsx` (React Email)

### Trigger

Vercel Cron Job configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/digest",
      "schedule": "0 13 * * *"
    }
  ]
}
```

`0 13 * * *` = 8am ET (UTC−5 in winter, UTC−4 in summer — adjust for DST or use a fixed offset).

The cron hits `GET /api/cron/digest` with a `Authorization: Bearer {CRON_SECRET}` header (Vercel sets this automatically).

### Digest logic

For each active row in `email_subscriptions`:

1. Query `events` WHERE:
   - `date >= CURRENT_DATE AND date <= CURRENT_DATE + 7`
   - `neighborhood` matches subscriber's `neighborhoods` filter (if not empty)
   - `type` matches subscriber's `event_types` filter (if not empty)
   - `price_type` matches subscriber's `price_filter`
   - `parsed_at > last_digest_sent_at` OR `last_digest_sent_at IS NULL` (exclude already-sent events)
2. If 0 matching events → skip this subscriber (no email sent)
3. If ≥1 event → send digest via Resend; cap at 10 events per email; update `last_digest_sent_at = NOW()`

### Email template

**Subject:** `This week in NYC music — BackstageMap`

**Body:**
- Intro line: "Here's what's happening near you this week."
- List of up to 10 events:
  - Event name + artist (if present)
  - Venue name, neighborhood
  - Date + time
  - Price label
  - "See on map →" link → `https://backstagemap.nyc/?event={event_id}` (opens map with EventDetailCard pre-opened)
- Footer:
  - Physical address placeholder (CAN-SPAM compliance)
  - "Unsubscribe" link → `{BASE_URL}/api/subscriptions?token={unsubscribe_token}`

**Note for Phase 1:** The digest is fully wired up and functional against dummy seed data. This proves the entire email loop works before live scraped data is available.

---

## 10. Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only; never exposed to client

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=<mapbox-token>

# Resend
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=digest@backstagemap.nyc

# Cron protection (Vercel sets this automatically for cron jobs)
CRON_SECRET=<random-secret>

# App base URL (used in email links)
NEXT_PUBLIC_BASE_URL=https://backstagemap.nyc
```

Google OAuth credentials are configured directly in the Supabase dashboard — no env vars needed in the Next.js app.

Create `.env.example` with the same keys but empty values; commit it. Never commit `.env.local`.

---

## 11. Local Dev Setup

Steps to get a dev environment running from zero:

```bash
# 1. Install dependencies
pnpm install

# 2. Start local Supabase stack (Postgres + PostGIS + Auth + Studio)
supabase start

# 3. Enable PostGIS (run in Supabase Studio SQL editor, or add to a migration file)
# CREATE EXTENSION IF NOT EXISTS postgis;

# 4. Copy env template and fill in values from `supabase status` output
cp .env.example .env.local

# 5. Apply migrations (creates all tables, indexes, trigger, RLS policies)
pnpm supabase db push

# 6. Seed dummy data
pnpm db:seed

# 7. Start dev server
pnpm dev
```

App runs at `http://localhost:3000`. Supabase Studio runs at `http://localhost:54323`.

### Google OAuth in local dev

Option A (simplest): use Supabase's built-in OAuth emulator — no Google Cloud Console setup needed.
Option B: create a dev OAuth app in Google Cloud Console with the callback URL set to `http://localhost:54321/auth/v1/callback`.

### Verify setup

After `pnpm dev`:
1. Map loads with ~600 colored pins across NYC
2. Filters change the pin set
3. Clicking a pin opens EventDetailCard
4. Sign up via email → confirm email → sign in → bookmark an event → appears on `/saved`
5. Subscribe via footer form → confirmation email received

---

## 12. Phase 1 Definition of Done

Phase 1 is complete when **all** of the following pass:

### Map & Data
- [ ] Map loads with ≥70 venue pins distributed across all 7 neighborhoods
- [ ] All 5 filter dimensions (date, neighborhood, type, price, time of day) correctly filter the pin set
- [ ] Clicking any pin opens the EventDetailCard with correct event data
- [ ] "View on venue site →" link is present and functional on every EventDetailCard
- [ ] Distance ranking is correct — closest venue appears first when lat/lng provided

### Auth
- [ ] Sign-up with email + password works; confirmation email received; session persists across page refresh
- [ ] Sign-in with Google works end-to-end
- [ ] `/saved` redirects unauthenticated users to `/auth/sign-in`
- [ ] Unauthenticated user clicking Bookmark sees "Log in to save events" prompt

### Bookmarks
- [ ] Bookmarking an event (logged in) persists and appears on `/saved`
- [ ] Removing a bookmark from `/saved` removes it immediately (optimistic update)

### Email
- [ ] Email sign-up via footer form creates a subscription; confirmation email is received
- [ ] Nightly digest cron runs and sends email with correct event list (testable by triggering the cron endpoint manually)
- [ ] Unsubscribe link removes subscription; subsequent digest does not send

### Seed & Data Quality
- [ ] Seed script is idempotent — running twice produces no duplicates
- [ ] All 7 neighborhoods represented in seed data

### Guardrails
- [ ] No scraping or AI parsing code is deployed or scheduled
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never referenced in any client-side code or `NEXT_PUBLIC_` variable
