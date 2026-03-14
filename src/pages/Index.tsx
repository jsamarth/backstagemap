import { useState } from "react";
import { MapView } from "@/components/MapView";
import { FilterBar } from "@/components/FilterBar";
import { EventDetailPanel } from "@/components/EventDetailPanel";
import { VenueEventsPanel } from "@/components/VenueEventsPanel";
import { EventLegend } from "@/components/EventLegend";
import { HeaderBar } from "@/components/HeaderBar";
import { LogoMark } from "@/components/LogoMark";
import { AuthModal } from "@/components/AuthModal";
import { SavedEventsPanel } from "@/components/SavedEventsPanel";
import { useEvents } from "@/hooks/useEvents";
import { useAuth } from "@/hooks/useAuth";
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
  const [authOpen, setAuthOpen] = useState(false);
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
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } = useAuth();
  const { bookmarks, isBookmarked, addBookmark, removeBookmark } = useBookmarks(user);

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

      {/* Auth buttons */}
      <HeaderBar
        user={user}
        onLoginClick={() => setAuthOpen(true)}
        onSignupClick={() => setAuthOpen(true)}
        onLogout={() => signOut()}
        onSavedClick={() => setSavedOpen(true)}
        savedCount={bookmarks.length}
      />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        user={user}
        onLoginClick={() => setAuthOpen(true)}
        onSignupClick={() => setAuthOpen(true)}
        onLogout={() => signOut()}
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
              removeBookmark.mutate(selectedEvent.id);
            } else {
              addBookmark.mutate(selectedEvent.id);
            }
          }}
          isLoggedIn={!!user}
          onLoginRequired={() => setAuthOpen(true)}
        />
      )}

      {/* Saved events panel */}
      {savedOpen && (
        <SavedEventsPanel
          bookmarks={bookmarks}
          onClose={() => setSavedOpen(false)}
          onSelectEvent={(e) => { setSelectedEvent(e); setSavedOpen(false); }}
          onRemoveBookmark={(id) => removeBookmark.mutate(id)}
        />
      )}

      {/* Auth modal */}
      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSignIn={signInWithEmail}
        onSignUp={signUpWithEmail}
        onGoogleSignIn={signInWithGoogle}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-md rounded-full px-4 py-2 border border-border">
          <p className="text-xs text-muted-foreground font-body animate-pulse">Loading events…</p>
        </div>
      )}
    </div>
  );
}
