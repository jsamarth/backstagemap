import { X, Clock, Music, Share2, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { EventWithVenue, EventTypeKey } from "@/types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, EVENT_TYPE_HEX } from "@/types";
import { format } from "date-fns";

interface VenueEventsPanelProps {
  events: EventWithVenue[];
  onClose: () => void;
  onSelectEvent: (event: EventWithVenue) => void;
}

export function VenueEventsPanel({ events, onClose, onSelectEvent }: VenueEventsPanelProps) {
  const venue = events[0].venues;

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden md:block fixed right-0 top-0 h-full w-96 bg-card border-l border-border z-30 animate-slide-in-right overflow-y-auto">
        <Content events={events} venueName={venue.name} onClose={onClose} onSelectEvent={onSelectEvent} />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 max-h-[70vh] bg-card border-t border-border z-30 animate-slide-in-bottom overflow-y-auto rounded-t-2xl">
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-2" />
        <Content events={events} venueName={venue.name} onClose={onClose} onSelectEvent={onSelectEvent} />
      </div>

      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-background/40 backdrop-blur-sm" onClick={onClose} />
    </>
  );
}

function Content({
  events,
  venueName,
  onClose,
  onSelectEvent,
}: {
  events: EventWithVenue[];
  venueName: string;
  onClose: () => void;
  onSelectEvent: (event: EventWithVenue) => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timerId = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timerId);
  }, [copied]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // clipboard access denied — no feedback needed
    }
  };

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Music className="w-4 h-4 text-primary shrink-0" />
          <h2 className="text-lg font-display font-bold truncate">{venueName}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className={`shrink-0 w-7 h-7 transition-colors ${copied ? "text-green-500" : "text-muted-foreground hover:text-foreground"}`}
            title={copied ? "Copied!" : "Share venue"}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-2">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground font-body uppercase tracking-wider">
        {events.length} upcoming event{events.length !== 1 ? "s" : ""}
      </p>

      {/* Event list */}
      <div className="space-y-2">
        {events.map((event) => {
          const eventType = event.event_type as EventTypeKey;
          const hex = EVENT_TYPE_HEX[eventType] || "#A855F7";
          return (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className="w-full text-left rounded-lg border border-border bg-accent/30 hover:bg-accent/60 transition-colors p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-body">
                  {EVENT_TYPE_LABELS[eventType]}
                </span>
              </div>
              <p className="text-sm font-display font-semibold truncate">{event.event_name}</p>
              {event.artist_name && (
                <p className="text-xs text-muted-foreground font-body truncate">{event.artist_name}</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-body">
                <Clock className="w-3 h-3 shrink-0" />
                <span>{format(new Date(event.date + "T12:00:00"), "EEE, MMM d")}</span>
                {event.time_start && <span>· {formatTime(event.time_start)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}
