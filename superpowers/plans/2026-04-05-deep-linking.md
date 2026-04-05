# Deep Linking & Share Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/event/:id/:slug` and `/venue/:id/:slug` URLs that open the correct map panel directly, with live URL updates as the user navigates, and a Share button in `EventDetailPanel`.

**Architecture:** Three new routes (all rendering `<Index />`), a `slugify()` utility, a `useEventDeepLink` hook for targeted Supabase fetches on direct URL loads, and `useNavigate` calls wired into all panel open/close actions. `MapView` gains a `flyToVenue` prop to center the map when arriving via deep link.

**Tech Stack:** React Router DOM v6 (`useParams`, `useNavigate`), TanStack React Query, Supabase JS, react-map-gl/maplibre, lucide-react, Vitest + jsdom

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/utils.ts` | Modify | Add `slugify()` |
| `src/hooks/useEventDeepLink.ts` | Create | Fetch single event or venue events by ID for deep link loads |
| `src/App.tsx` | Modify | Add two new routes |
| `src/components/MapView.tsx` | Modify | Accept `flyToVenue` prop, call `flyTo` when it changes |
| `src/pages/Index.tsx` | Modify | Read URL params, use deep link hook, navigate on all panel changes |
| `src/components/EventDetailPanel.tsx` | Modify | Add Share button |
| `src/test/slugify.test.ts` | Create | Unit tests for `slugify` |

---

## Task 1: `slugify()` utility

**Files:**
- Modify: `src/lib/utils.ts`
- Create: `src/test/slugify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/slugify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Mercury Lounge")).toBe("mercury-lounge");
  });

  it("strips special characters", () => {
    expect(slugify("Jazz Night!")).toBe("jazz-night");
  });

  it("collapses consecutive non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Mercury Lounge: Jazz Night!")).toBe("mercury-lounge-jazz-night");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("!Hello World!")).toBe("hello-world");
  });

  it("handles numbers", () => {
    expect(slugify("Open Mic #5")).toBe("open-mic-5");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun run test -- slugify
```

Expected: FAIL — `slugify is not a function` (or similar import error)

- [ ] **Step 3: Implement `slugify` in `src/lib/utils.ts`**

Add after the existing `cn()` export:

```ts
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
bun run test -- slugify
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.ts src/test/slugify.test.ts
git commit -m "feat: add slugify utility"
```

---

## Task 2: `useEventDeepLink` hook

**Files:**
- Create: `src/hooks/useEventDeepLink.ts`

This hook fetches a single event (by ID, joining venues) or all upcoming events for a venue (by venue ID). It is only enabled when an ID is present. It exposes `eventNotFound` / `venueNotFound` flags so `Index` can redirect on stale links.

- [ ] **Step 1: Create `src/hooks/useEventDeepLink.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EventWithVenue } from "@/types";

export function useEventDeepLink(
  eventId: string | null,
  venueId: string | null,
) {
  const eventQuery = useQuery({
    queryKey: ["event-deep-link", eventId],
    queryFn: async (): Promise<EventWithVenue | null> => {
      const { data } = await supabase
        .from("events")
        .select("*, venues(*)")
        .eq("id", eventId!)
        .single();
      return (data as EventWithVenue) ?? null;
    },
    enabled: !!eventId,
  });

  const venueQuery = useQuery({
    queryKey: ["venue-deep-link", venueId],
    queryFn: async (): Promise<EventWithVenue[] | null> => {
      const { data } = await supabase
        .from("events")
        .select("*, venues(*)")
        .eq("venue_id", venueId!)
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true });
      return (data as EventWithVenue[]) ?? null;
    },
    enabled: !!venueId,
  });

  return {
    event: eventQuery.data ?? null,
    venueEvents: venueQuery.data ?? null,
    isLoading: eventQuery.isLoading || venueQuery.isLoading,
    eventNotFound: eventQuery.isSuccess && !eventQuery.data,
    venueNotFound: venueQuery.isSuccess && (!venueQuery.data || venueQuery.data.length === 0),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useEventDeepLink.ts
git commit -m "feat: add useEventDeepLink hook"
```

---

## Task 3: New routes in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add two routes above the catch-all**

Open `src/App.tsx`. The current routes block is:

```tsx
<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

Replace with:

```tsx
<Routes>
  <Route path="/" element={<Index />} />
  <Route path="/event/:eventId/:eventSlug" element={<Index />} />
  <Route path="/venue/:venueId/:venueSlug" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add event and venue deep link routes"
```

---

## Task 4: `flyToVenue` prop in `MapView`

**Files:**
- Modify: `src/components/MapView.tsx`

- [ ] **Step 1: Add prop to interface and implement `useEffect`**

Open `src/components/MapView.tsx`.

Change the `MapViewProps` interface from:

```ts
interface MapViewProps {
  events: EventWithVenue[];
  selectedVenueId: string | null;
  onSelectVenue: (events: EventWithVenue[]) => void;
}
```

To:

```ts
interface MapViewProps {
  events: EventWithVenue[];
  selectedVenueId: string | null;
  onSelectVenue: (events: EventWithVenue[]) => void;
  flyToVenue?: { lng: number; lat: number } | null;
}
```

Change the function signature from:

```ts
export function MapView({ events, selectedVenueId, onSelectVenue }: MapViewProps) {
```

To:

```ts
export function MapView({ events, selectedVenueId, onSelectVenue, flyToVenue }: MapViewProps) {
```

Add a new `useEffect` directly after the existing geolocation `useEffect` (after line 64):

```ts
useEffect(() => {
  if (!flyToVenue || !mapRef.current) return;
  mapRef.current.flyTo({
    center: [flyToVenue.lng, flyToVenue.lat],
    zoom: 15,
    duration: 1200,
  });
}, [flyToVenue]);
```

- [ ] **Step 2: Verify the app still builds**

```bash
bun run build 2>&1 | tail -5
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/MapView.tsx
git commit -m "feat: add flyToVenue prop to MapView"
```

---

## Task 5: Wire deep linking and navigation into `Index.tsx`

**Files:**
- Modify: `src/pages/Index.tsx`

This is the largest change. `Index` gains: URL param reading, deep link data fetching, `flyToVenue` state, and `useNavigate` calls replacing all plain state mutations for panel open/close.

- [ ] **Step 1: Update imports**

Replace the current import block at the top of `src/pages/Index.tsx`:

```tsx
import { useState } from "react";
```

With:

```tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventDeepLink } from "@/hooks/useEventDeepLink";
import { slugify } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
```

- [ ] **Step 2: Replace function body**

Replace the entire `Index` function body. The full updated function:

```tsx
export default function Index() {
  const { eventId, venueId } = useParams<{
    eventId?: string;
    eventSlug?: string;
    venueId?: string;
    venueSlug?: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedVenueEvents, setSelectedVenueEvents] = useState<EventWithVenue[] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithVenue | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [flyToVenue, setFlyToVenue] = useState<{ lng: number; lat: number } | null>(null);

  const { data: events = [], isLoading } = useEvents(filters);
  const { bookmarks, isBookmarked, addBookmark, removeBookmark } = useBookmarks();

  const {
    event: deepLinkedEvent,
    venueEvents: deepLinkedVenueEvents,
    isLoading: deepLinkLoading,
    eventNotFound,
    venueNotFound,
  } = useEventDeepLink(eventId ?? null, venueId ?? null);

  // Open EventDetailPanel when deep link resolves
  useEffect(() => {
    if (!deepLinkedEvent) return;
    setSelectedEvent(deepLinkedEvent);
    setFlyToVenue({
      lng: deepLinkedEvent.venues.longitude,
      lat: deepLinkedEvent.venues.latitude,
    });
  }, [deepLinkedEvent]);

  // Open VenueEventsPanel when deep link resolves
  useEffect(() => {
    if (!deepLinkedVenueEvents?.length) return;
    setSelectedVenueEvents(deepLinkedVenueEvents);
    setFlyToVenue({
      lng: deepLinkedVenueEvents[0].venues.longitude,
      lat: deepLinkedVenueEvents[0].venues.latitude,
    });
  }, [deepLinkedVenueEvents]);

  // Redirect on stale/invalid deep links
  useEffect(() => {
    if (eventId && eventNotFound) {
      navigate("/");
      toast({ title: "Event not found", description: "This event may have been removed." });
    }
  }, [eventId, eventNotFound]);

  useEffect(() => {
    if (venueId && venueNotFound) {
      navigate("/");
      toast({ title: "Venue not found", description: "This venue may have been removed." });
    }
  }, [venueId, venueNotFound]);

  const handleSelectVenue = (venueEvents: EventWithVenue[]) => {
    if (venueEvents.length === 1) {
      const e = venueEvents[0];
      navigate(`/event/${e.id}/${slugify(e.event_name)}`);
      setSelectedVenueEvents(null);
      setSelectedEvent(e);
    } else {
      const v = venueEvents[0].venues;
      navigate(`/venue/${v.id}/${slugify(v.name)}`);
      setSelectedVenueEvents(venueEvents);
      setSelectedEvent(null);
    }
  };

  const handleCloseAll = () => {
    navigate("/");
    setSelectedVenueEvents(null);
    setSelectedEvent(null);
  };

  const handleSelectEvent = (event: EventWithVenue) => {
    navigate(`/event/${event.id}/${slugify(event.event_name)}`);
    setSelectedEvent(event);
  };

  const handleBackToVenue = () => {
    if (!selectedVenueEvents) return;
    const v = selectedVenueEvents[0].venues;
    navigate(`/venue/${v.id}/${slugify(v.name)}`);
    setSelectedEvent(null);
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden relative">
      {/* Map fills entire viewport */}
      <MapView
        events={events}
        selectedVenueId={selectedVenueEvents?.[0]?.venue_id ?? selectedEvent?.venue_id ?? null}
        onSelectVenue={handleSelectVenue}
        flyToVenue={flyToVenue}
      />

      {/* Logo */}
      <LogoMark />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onSavedClick={() => setSavedOpen(true)}
        savedCount={bookmarks.length}
        onFeedbackClick={() => setFeedbackOpen(true)}
      />

      {/* Legend */}
      <EventLegend />

      {/* Venue events list panel */}
      {selectedVenueEvents && !selectedEvent && (
        <VenueEventsPanel
          events={selectedVenueEvents}
          onClose={handleCloseAll}
          onSelectEvent={handleSelectEvent}
        />
      )}

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={handleCloseAll}
          onBack={selectedVenueEvents ? handleBackToVenue : undefined}
          isBookmarked={isBookmarked(selectedEvent.id)}
          onToggleBookmark={() => {
            if (isBookmarked(selectedEvent.id)) {
              removeBookmark(selectedEvent.id);
            } else {
              addBookmark(selectedEvent);
            }
          }}
        />
      )}

      {/* Saved events panel */}
      {savedOpen && (
        <SavedEventsPanel
          bookmarks={bookmarks}
          onClose={() => setSavedOpen(false)}
          onSelectEvent={(e) => {
            navigate(`/event/${e.id}/${slugify(e.event_name)}`);
            setSelectedEvent(e);
            setSavedOpen(false);
          }}
          onRemoveBookmark={(id) => removeBookmark(id)}
        />
      )}

      {/* Welcome modal */}
      <WelcomeModal />

      {/* Feedback modal */}
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {/* Loading state */}
      {(isLoading || deepLinkLoading) && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-md rounded-full px-4 py-2 border border-border">
          <p className="text-xs text-muted-foreground font-body animate-pulse">Loading events…</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the build passes**

```bash
bun run build 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: wire deep link params and navigate into Index"
```

---

## Task 6: Share button in `EventDetailPanel`

**Files:**
- Modify: `src/components/EventDetailPanel.tsx`

- [ ] **Step 1: Add `Share2` to the lucide-react import**

In `src/components/EventDetailPanel.tsx`, find the line:

```tsx
import { X, ChevronLeft, Bookmark, BookmarkCheck, ExternalLink, MapPin, Clock, DollarSign, Music, ThumbsUp, ThumbsDown } from "lucide-react";
```

Replace with:

```tsx
import { X, ChevronLeft, Bookmark, BookmarkCheck, ExternalLink, MapPin, Clock, DollarSign, Music, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
```

- [ ] **Step 2: Add `copied` state and `handleShare` to `PanelContent`**

In the `PanelContent` function, find:

```tsx
const [localRating, setLocalRating] = useState<"up" | "down" | null>(existingRating);
const [voted, setVoted] = useState(!!existingRating);
```

Replace with:

```tsx
const [localRating, setLocalRating] = useState<"up" | "down" | null>(existingRating);
const [voted, setVoted] = useState(!!existingRating);
const [copied, setCopied] = useState(false);

const handleShare = async () => {
  const url = window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ url });
    } catch {
      // user dismissed the share sheet — no feedback needed
    }
  } else {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
};
```

- [ ] **Step 3: Add the Share button to the actions row**

Find the actions `<div>`:

```tsx
{/* Actions */}
<div className="flex gap-2 pt-2">
  <Button onClick={onBookmark} variant={isBookmarked ? "secondary" : "default"} className="flex-1 gap-2">
    {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
    {isBookmarked ? "Saved" : "Save"}
  </Button>
  {(event.source_url ?? event.venues.website_url) && (
    <Button variant="outline" className="gap-2" asChild>
      <a
        href={event.source_url ?? event.venues.website_url!}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSourceClick}
      >
        <ExternalLink className="w-4 h-4" />
        Source
      </a>
    </Button>
  )}
</div>
```

Replace with:

```tsx
{/* Actions */}
<div className="flex gap-2 pt-2">
  <Button onClick={onBookmark} variant={isBookmarked ? "secondary" : "default"} className="flex-1 gap-2">
    {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
    {isBookmarked ? "Saved" : "Save"}
  </Button>
  {(event.source_url ?? event.venues.website_url) && (
    <Button variant="outline" className="gap-2" asChild>
      <a
        href={event.source_url ?? event.venues.website_url!}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSourceClick}
      >
        <ExternalLink className="w-4 h-4" />
        Source
      </a>
    </Button>
  )}
  <Button variant="outline" className="gap-2" onClick={handleShare}>
    <Share2 className="w-4 h-4" />
    {copied ? "Copied!" : "Share"}
  </Button>
</div>
```

- [ ] **Step 4: Verify the build passes**

```bash
bun run build 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run all tests**

```bash
bun run test
```

Expected: all tests PASS including the 5 slugify tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/EventDetailPanel.tsx
git commit -m "feat: add Share button to EventDetailPanel"
```

---

## Manual Smoke Test Checklist

After all tasks complete, verify in the browser (`bun run dev`):

- [ ] Clicking a single-event venue pin → URL changes to `/event/:id/:slug`, EventDetailPanel opens
- [ ] Clicking a multi-event venue pin → URL changes to `/venue/:id/:slug`, VenueEventsPanel opens
- [ ] Clicking an event in VenueEventsPanel → URL changes to `/event/:id/:slug`, EventDetailPanel opens with back button
- [ ] Back button in EventDetailPanel → URL changes back to `/venue/:id/:slug`, VenueEventsPanel reopens
- [ ] Close button → URL returns to `/`
- [ ] Open `/event/:id/:slug` directly in a fresh tab → panel opens, map flies to venue
- [ ] Open `/venue/:id/:slug` directly in a fresh tab → panel opens, map flies to venue
- [ ] Open `/event/bad-uuid/whatever` → redirects to `/`, shows "Event not found" toast
- [ ] Share button in EventDetailPanel → copies URL to clipboard (or opens system share sheet on mobile); "Copied!" shows briefly
- [ ] Browser back button works correctly throughout all flows
