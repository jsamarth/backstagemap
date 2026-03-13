import { X, MapPin, Clock, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventTypeKey } from "@/types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, NEIGHBORHOOD_LABELS } from "@/types";
import { format } from "date-fns";

interface SavedEventsPanelProps {
  bookmarks: any[];
  onClose: () => void;
  onSelectEvent: (event: any) => void;
  onRemoveBookmark: (eventId: string) => void;
}

export function SavedEventsPanel({ bookmarks, onClose, onSelectEvent, onRemoveBookmark }: SavedEventsPanelProps) {
  return (
    <>
      <div className="hidden md:block fixed right-0 top-0 h-full w-96 bg-card border-l border-border z-30 animate-slide-in-right overflow-y-auto">
        <Content bookmarks={bookmarks} onClose={onClose} onSelectEvent={onSelectEvent} onRemoveBookmark={onRemoveBookmark} />
      </div>
      <div className="md:hidden fixed bottom-0 left-0 right-0 max-h-[80vh] bg-card border-t border-border z-30 animate-slide-in-bottom overflow-y-auto rounded-t-2xl">
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-2" />
        <Content bookmarks={bookmarks} onClose={onClose} onSelectEvent={onSelectEvent} onRemoveBookmark={onRemoveBookmark} />
      </div>
      <div className="fixed inset-0 z-20 bg-background/40 backdrop-blur-sm" onClick={onClose} />
    </>
  );
}

function Content({ bookmarks, onClose, onSelectEvent, onRemoveBookmark }: SavedEventsPanelProps) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-lg">Saved Events</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
      </div>
      {bookmarks.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body py-8 text-center">No saved events yet. Tap the bookmark icon on any event to save it.</p>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((b: any) => {
            const event = b.events;
            if (!event) return null;
            const venue = event.venues;
            const eventType = event.event_type as EventTypeKey;
            return (
              <div
                key={b.id}
                className="bg-accent/50 rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => onSelectEvent({ ...event, venues: venue })}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_COLORS[eventType]}`} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-body">{EVENT_TYPE_LABELS[eventType]}</span>
                    </div>
                    <p className="font-display font-semibold text-sm truncate">{event.event_name}</p>
                    <p className="text-xs text-muted-foreground font-body">{venue?.name}</p>
                    <p className="text-xs text-muted-foreground font-body">{format(new Date(event.date + "T12:00:00"), "EEE, MMM d")}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onRemoveBookmark(event.id); }}
                  >
                    <Bookmark className="w-4 h-4 fill-current" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
