import { X, ChevronLeft, Bookmark, BookmarkCheck, ExternalLink, MapPin, Clock, DollarSign, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventWithVenue, EventTypeKey } from "@/types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, NEIGHBORHOOD_LABELS, PRICE_TYPE_LABELS } from "@/types";
import { format } from "date-fns";

interface EventDetailPanelProps {
  event: EventWithVenue;
  onClose: () => void;
  onBack?: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

export function EventDetailPanel({
  event,
  onClose,
  onBack,
  isBookmarked,
  onToggleBookmark,
}: EventDetailPanelProps) {
  const eventType = event.event_type as EventTypeKey;

  const handleBookmark = () => {
    onToggleBookmark();
  };

  const formatTime = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  return (
    <>
      {/* Desktop: side panel */}
      <div className="hidden md:block fixed right-0 top-0 h-full w-96 bg-card border-l border-border z-30 animate-slide-in-right overflow-y-auto">
        <PanelContent
          event={event}
          eventType={eventType}
          onClose={onClose}
          onBack={onBack}
          isBookmarked={isBookmarked}
          onBookmark={handleBookmark}
          formatTime={formatTime}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 max-h-[70vh] bg-card border-t border-border z-30 animate-slide-in-bottom overflow-y-auto rounded-t-2xl">
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mt-3 mb-2" />
        <PanelContent
          event={event}
          eventType={eventType}
          onClose={onClose}
          onBack={onBack}
          isBookmarked={isBookmarked}
          onBookmark={handleBookmark}
          formatTime={formatTime}
        />
      </div>

      {/* Backdrop */}
      <div className="fixed inset-0 z-20 bg-background/40 backdrop-blur-sm" onClick={onClose} />
    </>
  );
}

function PanelContent({
  event,
  eventType,
  onClose,
  onBack,
  isBookmarked,
  onBookmark,
  formatTime,
}: {
  event: EventWithVenue;
  eventType: EventTypeKey;
  onClose: () => void;
  onBack?: () => void;
  isBookmarked: boolean;
  onBookmark: () => void;
  formatTime: (t: string | null) => string;
}) {
  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-1 flex-1 min-w-0">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 -mt-1 -ml-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${EVENT_TYPE_COLORS[eventType]}`} />
              <span className="text-xs font-body text-muted-foreground uppercase tracking-wider">
                {EVENT_TYPE_LABELS[eventType]}
              </span>
            </div>
            <h2 className="text-xl font-display font-bold truncate">{event.event_name}</h2>
            {event.artist_name && (
              <p className="text-sm text-muted-foreground font-body">{event.artist_name}</p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mt-1 -mr-2">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Venue info */}
      <div className="bg-accent/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary shrink-0" />
          <span className="font-display font-semibold text-sm">{event.venues.name}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="text-xs font-body">{event.venues.address}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-xs font-body capitalize">{NEIGHBORHOOD_LABELS[event.venues.neighborhood as keyof typeof NEIGHBORHOOD_LABELS]}</span>
        </div>
      </div>

      {/* Date & Time */}
      <div className="flex items-center gap-4 text-sm font-body">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{format(new Date(event.date + "T12:00:00"), "EEE, MMM d")}</span>
        </div>
        {event.time_start && (
          <span className="text-muted-foreground">
            {formatTime(event.time_start)}
            {event.time_end && ` – ${formatTime(event.time_end)}`}
          </span>
        )}
      </div>

      {/* Price */}
      <div className="flex items-center gap-2 text-sm font-body">
        <DollarSign className="w-4 h-4 text-muted-foreground" />
        {event.price_type === "free" ? (
          <span className="text-pin-jam-session font-semibold">Free</span>
        ) : (
          <span>
            {PRICE_TYPE_LABELS[event.price_type as keyof typeof PRICE_TYPE_LABELS]}
            {event.price_amount && ` · $${event.price_amount}`}
          </span>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <p className="text-sm text-muted-foreground font-body leading-relaxed">{event.description}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button onClick={onBookmark} variant={isBookmarked ? "secondary" : "default"} className="flex-1 gap-2">
          {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          {isBookmarked ? "Saved" : "Save"}
        </Button>
        {(event.source_url ?? event.venues.website_url) && (
          <Button variant="outline" className="gap-2" asChild>
            <a href={event.source_url ?? event.venues.website_url!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
              Source
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
