import { useState } from "react";
import { MapView } from "@/components/MapView";
import { FilterBar } from "@/components/FilterBar";
import { EventDetailPanel } from "@/components/EventDetailPanel";
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
  neighborhoods: [],
  eventTypes: [],
  priceTypes: [],
  timeOfDay: [],
};

export default function Index() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedEvent, setSelectedEvent] = useState<EventWithVenue | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  const { data: events = [], isLoading } = useEvents(filters);
  const { user, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } = useAuth();
  const { bookmarks, isBookmarked, addBookmark, removeBookmark } = useBookmarks(user);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Map fills entire viewport */}
      <MapView
        events={events}
        selectedEventId={selectedEvent?.id ?? null}
        onSelectEvent={setSelectedEvent}
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
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Legend */}
      <EventLegend />

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
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
