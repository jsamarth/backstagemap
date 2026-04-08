import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useEventDeepLink } from "@/hooks/useEventDeepLink";
import { slugify } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MapView } from "@/components/MapView";
import { FilterBar } from "@/components/FilterBar";
import { EventDetailPanel } from "@/components/EventDetailPanel";
import { VenueEventsPanel } from "@/components/VenueEventsPanel";
import { EventLegend } from "@/components/EventLegend";
import { LogoMark } from "@/components/LogoMark";
import { SavedEventsPanel } from "@/components/SavedEventsPanel";
import { WelcomeModal } from "@/components/WelcomeModal";
import { FeedbackModal } from "@/components/FeedbackModal";
import { VenueSearchBar } from "@/components/VenueSearchBar";
import { useEvents } from "@/hooks/useEvents";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { FilterState, EventWithVenue } from "@/types";

const defaultFilters: FilterState = {
  date: null,
  eventTypes: [],
  priceTypes: [],
  timeOfDay: [],
  venueIds: [],
};

export default function Index() {
  // slugs are cosmetic in the URL; only IDs are used for lookups
  const { eventId, venueId } = useParams<{
    eventId?: string;
    venueId?: string;
  }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const flyToKeyRef = useRef<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedVenueEvents, setSelectedVenueEvents] = useState<EventWithVenue[] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithVenue | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [flyToVenue, setFlyToVenue] = useState<{ lng: number; lat: number } | null>(null);

  const { data: events = [], isLoading } = useEvents(filters);
  const { bookmarks, isBookmarked, addBookmark, removeBookmark } = useBookmarks();

  const filteredEvents = filters.venueIds.length > 0
    ? events.filter((e) => filters.venueIds.includes(e.venue_id))
    : events;

  const {
    event: deepLinkedEvent,
    venueEvents: deepLinkedVenueEvents,
    isLoading: deepLinkLoading,
    eventNotFound,
  } = useEventDeepLink(eventId ?? null, venueId ?? null);

  // Open EventDetailPanel when deep link resolves
  useEffect(() => {
    if (!deepLinkedEvent) return;
    setSelectedEvent(deepLinkedEvent);
    // Guard: only fly once per unique event (prevents re-fire on background refetches)
    if (flyToKeyRef.current !== deepLinkedEvent.id) {
      flyToKeyRef.current = deepLinkedEvent.id;
      setFlyToVenue({
        lng: deepLinkedEvent.venues.longitude,
        lat: deepLinkedEvent.venues.latitude,
      });
    }
  }, [deepLinkedEvent]);

  // Open VenueEventsPanel when deep link resolves
  useEffect(() => {
    if (!deepLinkedVenueEvents?.length) return;
    setSelectedVenueEvents(deepLinkedVenueEvents);
    // Guard: only fly once per unique venue (prevents re-fire on background refetches)
    const venueId = deepLinkedVenueEvents[0].venue_id;
    if (flyToKeyRef.current !== venueId) {
      flyToKeyRef.current = venueId;
      setFlyToVenue({
        lng: deepLinkedVenueEvents[0].venues.longitude,
        lat: deepLinkedVenueEvents[0].venues.latitude,
      });
    }
  }, [deepLinkedVenueEvents]);

  // Redirect on stale/invalid deep links
  useEffect(() => {
    if (eventId && eventNotFound) {
      navigate("/");
      toast({ title: "Event not found", description: "This event may have been removed." });
    }
  }, [eventId, eventNotFound, navigate, toast]);

  // Sync panel close when URL params cleared (e.g. browser back button)
  useEffect(() => {
    if (!eventId && !venueId) {
      setSelectedEvent(null);
      setSelectedVenueEvents(null);
    }
  }, [eventId, venueId]);

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
    setFlyToVenue(null);
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
        events={filteredEvents}
        selectedVenueId={selectedVenueEvents?.[0]?.venue_id ?? selectedEvent?.venue_id ?? null}
        onSelectVenue={handleSelectVenue}
        flyToVenue={flyToVenue}
      />

      {/* Logo */}
      <LogoMark />

      {/* Venue search */}
      <VenueSearchBar
        events={events}
        selectedIds={filters.venueIds}
        onChange={(ids) => setFilters((f) => ({ ...f, venueIds: ids }))}
      />

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
