# Deep Linking & Share Button Design

**Date:** 2026-04-01  
**Status:** Approved

## Overview

Add unique URLs for each event and venue so that opening the URL in a browser directly opens the correct panel on the map. Add a Share button to `EventDetailPanel` that shares the current URL.

## URL Structure

Two new routes, both rendering `<Index />`:

```
/                              → default map, no panel open
/event/:eventId/:eventSlug     → map + EventDetailPanel open
/venue/:venueId/:venueSlug     → map + VenueEventsPanel open
```

**Slug format:** Derived client-side from the event or venue name. Sanitization rules: lowercase, trim whitespace, replace non-alphanumeric characters with `-`, collapse consecutive `-`. Example: `Mercury Lounge: Jazz Night!` → `mercury-lounge-jazz-night`.

**Slug is cosmetic only.** The UUID ID is the sole lookup key. A URL with a correct ID and wrong slug still works — no redirect or error.

No schema changes required.

## Routing

`App.tsx` gets two additional `<Route>` entries above the catch-all:

```tsx
<Route path="/event/:eventId/:eventSlug" element={<Index />} />
<Route path="/venue/:venueId/:venueSlug" element={<Index />} />
```

## State Management & Navigation

### Deep link on mount (`Index.tsx`)

- Read `useParams()` on mount.
- If `eventId` present → run a targeted Supabase query for that event (join venues) → set `selectedEvent` → fly map to venue coordinates.
- If `venueId` present → query all events for that venue → set `selectedVenueEvents` → fly map to venue coordinates.
- If query returns null (deleted/invalid ID) → `useNavigate('/')` + optional toast "Event not found."

### Live URL updates

- **Pin click** → `useNavigate` to `/event/:id/:slug` (single-event venue) or `/venue/:id/:slug` (multi-event venue). Slug generated client-side from name at navigate time.
- **Drill from VenueEventsPanel into event** → `useNavigate` to `/event/:id/:slug`.
- **Close panel** → `useNavigate('/')`.

### Map fly-to

`MapView` accepts an optional `flyToVenue?: { lng: number; lat: number; zoom?: number }` prop. When present, it calls `flyTo` once on mount (after the map is ready). Only populated when arriving via a deep link.

## Slug Utility

`slugify(name: string): string` added to `src/lib/utils.ts` alongside the existing `cn()` helper.

## Share Button (`EventDetailPanel` only)

Added to the action row next to Save and Source buttons.

**Behavior:**
1. If `navigator.share` is available (mobile) → call `navigator.share({ url: window.location.href })`.
2. Otherwise → `navigator.clipboard.writeText(window.location.href)`.
3. On clipboard copy success → button label changes to "Copied!" for 1.5 seconds, then resets to "Share". (Web Share API shows the system sheet — no custom feedback needed.)

**Icon:** `Share2` from lucide-react.

The URL shared is always `window.location.href` — since the URL updates live as the user navigates, no URL construction is needed at share time.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Invalid/deleted event ID in URL | Query returns null → `navigate('/')`, optional toast |
| Slug mismatch (wrong slug, correct ID) | ID-only lookup, works silently |
| Deep link before map ready | Loading spinner shown; map flies to venue once query resolves |
| Venue with 1 event, clicked via pin | Existing `handleSelectVenue` routes to `/event/...` directly (not `/venue/...`) |
| Venue with 1 event, opened via `/venue/...` URL | Opens `VenueEventsPanel` (respects the URL intent) |

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Add two new routes |
| `src/lib/utils.ts` | Add `slugify()` |
| `src/pages/Index.tsx` | Read params on mount, live URL updates via `useNavigate`, pass `flyToVenue` to `MapView` |
| `src/components/MapView.tsx` | Accept + handle `flyToVenue` prop |
| `src/components/EventDetailPanel.tsx` | Add Share button |
| `src/hooks/useEventDeepLink.ts` | New hook — encapsulates the deep link fetch logic (event or venue by ID) |
