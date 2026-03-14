import { useState } from "react";
import { MapView } from "@/components/MapView";
import { FilterBar } from "@/components/FilterBar";
import { EventDetailPanel } from "@/components/EventDetailPanel";
import { VenueEventsPanel } from "@/components/VenueEventsPanel";
import { EventLegend } from "@/components/EventLegend";
import { LogoMark } from "@/components/LogoMark";
import { SavedEventsPanel } from "@/components/SavedEventsPanel";
import { useEvents } from "@/hooks/useEvents";
import { useBookmarks } from "@/hooks/useBookmarks";
import type { FilterState, EventWithVenue } from "@/types";

const defaultFilters: FilterState = {
  date: null,
  eventTypes: [],
  priceTypes: [],
  timeOfDay: [],
};

export default function Index() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedVenueEvents, setSelectedVenueEvents] = useState<EventWithVenue[] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventWithVenue | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  const handleSelectVenue = (venueEvents: EventWithVenue[]) => {
    if (venueEvents.length === 1) {
      setSelectedVenueEvents(null);
      setSelectedEvent(venueEvents[0]);
    } else {
      setSelectedVenueEvents(venueEvents);
      setSelectedEvent(null);
    }
  };

  const handleCloseAll = () => {
    setSelectedVenueEvents(null);
    setSelectedEvent(null);
  };

  const { data: events = [], isLoading } = useEvents(filters);
  const { bookmarks, isBookmarked, addBookmark, removeBookmark } = useBookmarks();

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Map fills entire viewport */}
      <MapView
        events={events}
        selectedVenueId={selectedVenueEvents?.[0]?.venue_id ?? selectedEvent?.venue_id ?? null}
        onSelectVenue={handleSelectVenue}
      />

      {/* Logo */}
      <LogoMark />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onSavedClick={() => setSavedOpen(true)}
        savedCount={bookmarks.length}
      />

      {/* Legend */}
      <EventLegend />

      {/* Venue events list panel */}
      {selectedVenueEvents && !selectedEvent && (
        <VenueEventsPanel
          events={selectedVenueEvents}
          onClose={handleCloseAll}
          onSelectEvent={setSelectedEvent}
        />
      )}

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={handleCloseAll}
          onBack={selectedVenueEvents ? () => setSelectedEvent(null) : undefined}
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
          onSelectEvent={(e) => { setSelectedEvent(e); setSavedOpen(false); }}
          onRemoveBookmark={(id) => removeBookmark(id)}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-md rounded-full px-4 py-2 border border-border">
          <p className="text-xs text-muted-foreground font-body animate-pulse">Loading events…</p>
        </div>
      )}
    </div>
  );
}
