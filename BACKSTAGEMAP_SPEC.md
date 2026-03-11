# BackstageMap — Product Spec (MVP)

> **Single source of truth for the BackstageMap MVP.**
> Last updated: March 2026

---

## 1. Product Vision & Problem Statement

### Vision

BackstageMap is a music event discovery app for NYC fans who want to find live events that never appear on paid platforms like Eventbrite or Resident Advisor. Small venues, bars, and bands skip those platforms because of cost — creating a large, invisible layer of the city's music scene. BackstageMap surfaces that hidden layer in a single, browsable map.

### The Problem

Local music discovery has two sides:

**For fans:** You can't find shows unless you already follow a venue on Instagram or stumble onto their website calendar. There's no single place to see what's happening nearby tonight across the venues that don't advertise.

**For small venues and artists:** There's no affordable distribution channel. Even when they do post their events, they only reach their existing audience.

BackstageMap solves the fan-side problem first. If fans come, venue visibility follows naturally.

---

## 2. User Personas

### Primary: The Casual Music Fan

- Lives or works in Brooklyn or Lower Manhattan
- Goes to 1–3 live music events per month
- Doesn't have the time or energy to check 20 different venue websites
- Wants to know what's on tonight or this weekend within a short distance
- Motivated by discovery — finding something they wouldn't have found otherwise

### Secondary: The Regular Scenester

- Goes to shows multiple times a week
- Already follows several venues on Instagram but wants broader coverage
- Frustrated by how fragmented the local scene is across platforms
- Wants to explore neighborhoods outside their usual circuit

### Not the Target (for MVP)

- Tourists looking for major acts at large venues (those are already on Eventbrite/RA)
- Artists and venues looking to promote their own events (that's a post-MVP use case)

---

## 3. MVP Scope

### Geographic Coverage

7 neighborhoods, NYC only:

- Williamsburg
- Bushwick
- Bed-Stuy
- East Village
- West Village
- Chelsea
- Greenpoint

NYC-only to start. Dense, music-rich, and manageable to validate the pipeline and product before expanding.

### Event Types

All music events are in scope:

- Live bands and concerts
- DJ nights
- Open mics
- Jam sessions
- Any event at a music-friendly venue that is music-related

Non-music events (comedy nights, trivia, sports screenings) are excluded even if they occur at venues in the index.

### UX Goals

1. **Discover** — A map showing music events happening around the user, updated daily.
2. **Filter & Sort** — By date, neighborhood, event type, price (free vs. paid), time of day.
3. **Explore** — Click any event to see a detail card with full info and a link to the original source (venue website calendar page).
4. **Save** — Lightweight account (email or Google login) to bookmark events for later.

### Build Phases

#### Phase 1 — App Skeleton

- Stand up the full stack: frontend map UI, API server, Postgres + PostGIS schema, auth (email + Google OAuth)
- Seed the DB manually with a realistic dummy set of venues and events covering the 7 neighborhoods
- All user-facing features work end-to-end against this dummy data: map pins, distance ranking, filters, event detail card, bookmarking, email digest
- No scraping workflows in this phase — focus is on proving the product skeleton is solid

#### Phase 2 — Live Data Pipeline

- Activate all 4 workflows: Venue Discovery, HTML Scraping, AI Parsing, Freshness Reset
- Replace dummy data with real scraped events
- Quality gate: ≥80% of scraped events must be accurate (correct name, date, venue) before Phase 2 is considered complete

---

## 4. Data Architecture

> **MVP constraint: all event data comes exclusively from scraping venue websites.** No third-party platform APIs — no Eventbrite, no Resident Advisor, no Instagram — are in scope for MVP.

The pipeline is driven by a `scrape_status` field on each venue record. All four workflows read and write this field to coordinate data flow.

### `scrape_status` State Machine

```
[Workflow 1 — Yelp/Google Maps scraping]
        ↓ new venue found
   NOT_STARTED  ←─────────────────────────────────────────┐
        ↓                                                  │
[Workflow 2 — nightly, picks 30 oldest NOT_STARTED]        │
   On success → HTML_SCRAPED                               │
   On failure → stays NOT_STARTED (logged)                 │
        ↓                                                  │
[Workflow 3 — daily, processes all HTML_SCRAPED]           │
     EXTRACTED                                             │
        ↓                                                  │
[Workflow 4 — every 5 days, resets oldest EXTRACTED] ──────┘
```

### Workflow 1 — Venue Discovery

Runs on schedule; always tries to find new venues not already in the database.

- **Source:** Google Maps / Yelp — queries like "live music venues", "bars with live music", "music parks" etc. for each of the 7 target neighborhoods
- **Deduplication:** by `google_maps_venue_id` — venues already in the database are skipped
- **Output:** new venues inserted with `scrape_status = NOT_STARTED`
- **Goal:** bring total indexed venues toward ~100 across all neighborhoods

### Workflow 2 — Nightly HTML Scraping

- **Schedule:** nightly
- **Batch:** 30 venues per run, selected by `scrape_status = NOT_STARTED`, sorted by `last_scraped_at` ASC (oldest first)
- **Per venue:** fetch the calendar/events page, capture raw HTML, upload to blob storage, store the blob path in `raw_html_url` with timestamp and source URL
- **On success:** `scrape_status → HTML_SCRAPED`, update `last_scraped_at`
- **On failure:** log error, leave `scrape_status = NOT_STARTED` — venue is automatically retried in the next nightly cycle

The scraper is resilient — a failure on one venue does not block the rest of the batch. Each venue's scrape is independent.

### Workflow 3 — Daily AI Parsing

- **Schedule:** daily (after Workflow 2, or at a fixed time)
- **Selection:** all venues with `scrape_status = HTML_SCRAPED`
- **Processing:** AI model extracts structured event records from the stored raw HTML
- **Output:** upserts into the events table (unique key: `venue_id + date + event_name`); on completion sets `scrape_status → EXTRACTED` and updates `extracted_at`

### Workflow 4 — Freshness Reset

- **Schedule:** every 5 days
- **Selection:** venues with `scrape_status = EXTRACTED`, sorted by `extracted_at` ASC (least recently refreshed first)
- **Action:** `scrape_status → NOT_STARTED`, re-queuing them for Workflow 2 → 3
- Existing events for those venues remain live until they are replaced by the next extraction cycle

---

## 5. Feature List

### Map View

- Events shown as pins on the map, ranked by distance from the user's location (closest first)
- Pins are color-coded by event type
- Default center: user's location; falls back to NYC center if location is not granted

### Filter & Sort

- **Date**: today, tomorrow, this weekend, date picker
- **Neighborhood**: multi-select from the 7 target neighborhoods
- **Event type**: live music, DJ, open mic, jam session
- **Price**: free only, paid, all
- **Time of day**: afternoon, evening, late night

### Event Detail Card

- Triggered by clicking a map pin or list item
- Shows: event name, artist, venue name, date, time, price, description
- Bookmark button (requires login)

### Bookmarking

- Requires a full account (email or Google login)
- No bookmark limit for MVP
- Bookmarked events surface on a "Saved" view separate from the main map

### Auth

- Email and Google OAuth are both supported in MVP

### Email Digest

See Section 7 for full details.

---

## 6. Freemium Model

Monetization via a freemium model is planned but post-MVP. For MVP, all users have identical access to the full event map. Premium access for early testers will be granted manually. See Section 13 for the planned tier design.

---

## 7. Email Subscription Feature

Users can subscribe to receive new events matching their saved filters via email digest.

### How It Works

1. User sets filter preferences: neighborhood(s), event type, price range, days of week
2. User provides their email — no full account required to subscribe
3. After the nightly data refresh, BackstageMap sends a digest email containing new events matching the user's criteria that were not in the previous day's results
4. Every email includes an unsubscribe link (CAN-SPAM compliant)

### Filter Preferences and Accounts

Non-account subscribers (email-only) receive a digest using default filters: all 7 neighborhoods, all event types, all price ranges. Customizing filter preferences requires a full account (email or Google login).

### Purpose

This is the primary retention and re-engagement loop. Even passive users who don't open the app daily stay connected to the product and come back when something in the digest catches their attention.

---

## 8. Go-to-Market Phases

### Phase 1 — Seed the Data, Validate the Value

Before any public launch, manually verify that the data pipeline produces accurate, useful event listings. Use a handful of well-known Williamsburg and East Village venues as the initial test set.

**Quality gate:** 80% of scraped events must be accurate (correct name, date, venue) before moving to Phase 2. 50 reliable events beats 500 garbage ones.

### Phase 2 — Soft Launch (Friends & Community)

Share with music fans in the target communities:

- Local Reddit subreddits: r/nyc, r/Brooklyn
- Discord servers for local music scenes
- Word of mouth from early users

Goal: get real users engaging with the map, collecting feedback on what's missing or inaccurate, and identifying gaps in venue coverage.

### Phase 3 — Establish Trust with Venues

Proactively reach out to small venues to let them know they're listed. Offer a way for them to correct or update their info. This builds goodwill and turns venues into organic promoters — they'll share BackstageMap when they see their events represented accurately.

### Phase 4 — Expand the Neighborhood Footprint

Once the pipeline is reliable and the product feels polished, add new neighborhoods (LES, Harlem, Astoria, etc.) and eventually other cities.

---

## 9. Success Metrics


| Metric       | Target                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Data quality | ≥80% of scraped events are accurate (correct name, date, venue)        |
| Coverage     | 50+ active venues indexed across the 7 neighborhoods                   |
| Engagement   | Users who reach the map view explore at least 3 events per session     |
| Retention    | Users who bookmark an event return within 7 days to check for new ones |


---

## 10. Key Risks

### Scraping Reliability

Venue websites change structure frequently. The pipeline must be resilient to individual venue failures without crashing the entire nightly batch. Failed scrapes should be logged and surfaced for manual review, not silently dropped.

### Data Staleness

If the AI parser misreads a date, or a venue cancels an event without updating their website, users show up to nothing. Need a mechanism to flag suspicious data — e.g., events with dates in the past that were never marked complete, or events with unusually sparse data fields.

### Cold Start Problem

The map is useless with sparse data. The MVP must launch with enough coverage to feel immediately valuable, not just promising. This is why Phase 1 includes a manual quality gate before public launch.

### Venue Resistance

Some venues may not want to be scraped or may block bots. The scraper should be respectful (rate limiting, honoring robots.txt where appropriate) and the product needs a clear value prop to win venues over when contacted directly.

---

## 11. Out of Scope for MVP

The following are explicitly deferred to post-MVP:

- Ticket purchasing or payment processing
- Social features: following artists, sharing events, reviews
- Venue or artist accounts and dashboards
- Native mobile app (web-first)
- Cities beyond NYC
- Real-time or hourly data refresh
- User-submitted events
- In-app payment or subscription management (Stripe integration deferred; early premium access granted manually)
- **Third-party event platform integrations: Eventbrite API, Resident Advisor, Instagram** — all deferred to post-MVP

---

## 12. Technical Deep Dive

### Venues Table Schema


| Field                  | Type                  | Notes                                                              |
| ---------------------- | --------------------- | ------------------------------------------------------------------ |
| `id`                   | UUID                  | PK                                                                 |
| `name`                 | text                  |                                                                    |
| `google_maps_venue_id` | text                  | unique; used for dedup in Workflow 1                               |
| `address`              | text                  |                                                                    |
| `neighborhood`         | enum                  | one of the 7 target neighborhoods                                  |
| `venue_type`           | enum                  | park, bar, cafe, performance_venue, club                           |
| `website_url`          | text                  |                                                                    |
| `calendar_url`         | text                  | may differ from homepage                                           |
| `location`             | geometry(Point, 4326) | PostGIS point; enables distance queries and bounding-box filtering |
| `scrape_status`        | enum                  | NOT_STARTED, HTML_SCRAPED, EXTRACTED                               |
| `raw_html_url`         | text                  | blob storage path to latest HTML from Workflow 2                   |
| `last_scraped_at`      | timestamp             | updated by Workflow 2                                              |
| `extracted_at`         | timestamp             | updated by Workflow 3                                              |
| `created_at`           | timestamp             |                                                                    |


### Events Table Schema


| Field          | Type      | Notes                               |
| -------------- | --------- | ----------------------------------- |
| `id`           | UUID      | PK                                  |
| `venue_id`     | UUID      | FK → venues                         |
| `event_name`   | text      |                                     |
| `artist_name`  | text      | nullable                            |
| `date`         | date      | YYYY-MM-DD                          |
| `time_start`   | time      | nullable                            |
| `time_end`     | time      | nullable                            |
| `price_type`   | enum      | free, cover, ticketed               |
| `price_amount` | decimal   | nullable                            |
| `description`  | text      | nullable                            |
| `type`         | text      | rock, folk, DJ, open-mic, jam, etc. |
| `recurring`    | boolean   |                                     |
| `source_url`   | text      | direct link to venue calendar page  |
| `parsed_at`    | timestamp |                                     |
| `created_at`   | timestamp |                                     |


### Infrastructure Notes

**PostGIS** — the venues table uses a `geometry(Point, 4326)` column (`location`) populated from the venue's lat/lng at insert time. This enables two critical query patterns:

- **Distance ranking:** `ORDER BY location <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)` returns events sorted by proximity to the user with index support (no full-table scan).
- **Bounding-box filtering:** `WHERE location && ST_MakeEnvelope(...)` restricts results to the visible map viewport efficiently.

**Blob Storage** — raw HTML from Workflow 2 is written to blob storage (e.g., S3 / R2 / GCS) rather than stored inline in Postgres. The `raw_html_url` column holds the path. This keeps the database lean, avoids row-size bloat on large HTML pages, and lets Workflow 3 stream the content directly from object storage without pulling it through the API layer.

### Workflow Schedule Summary


| Workflow            | Frequency    | Reads                                                 | Writes                                                   |
| ------------------- | ------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| 1 — Venue Discovery | On schedule  | Google Maps / Yelp                                    | venues (new rows, NOT_STARTED)                           |
| 2 — HTML Scraping   | Nightly      | venues WHERE scrape_status = NOT_STARTED (30 oldest)  | raw_html, last_scraped_at, scrape_status → HTML_SCRAPED  |
| 3 — AI Parsing      | Daily        | venues WHERE scrape_status = HTML_SCRAPED             | events (upsert), scrape_status → EXTRACTED, extracted_at |
| 4 — Freshness Reset | Every 5 days | venues WHERE scrape_status = EXTRACTED (oldest first) | scrape_status → NOT_STARTED                              |


---

## 13. Post-MVP Roadmap

The following items are deferred until after MVP validation:

### Freemium Tier Differentiation

- Free tier: up to 10 events within a 2-mile radius; digest capped at 10 events; up to 5 bookmarks
- Premium tier: unlimited events city-wide; full email digest; unlimited bookmarks; early access to new neighborhoods
- In-app payment processing (Stripe or equivalent)

### Event Detail Enhancements

- Source attribution link: "Via [Venue Name] website" on the event detail card
- `spotify_artist_profile` field: Spotify URL enrichment for artist records

### Platform Expansion

- Social features: following artists, sharing events, reviews
- Venue and artist accounts and dashboards
- Native mobile app (web-first for MVP)
- City expansion beyond NYC
- Third-party event platform integrations: Eventbrite API, Resident Advisor, Instagram

---

*BackstageMap MVP — all event data sourced exclusively from venue website scraping.*