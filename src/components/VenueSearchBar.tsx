import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import type { EventWithVenue } from "@/types";

interface VenueSearchBarProps {
  events: EventWithVenue[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function VenueSearchBar({ events, selectedIds, onChange }: VenueSearchBarProps) {
  const [open, setOpen] = useState(false);

  // Derive unique venues from events, preserving insertion order
  const venues = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string; neighborhood: string }[] = [];
    for (const e of events) {
      if (!seen.has(e.venue_id)) {
        seen.add(e.venue_id);
        result.push({
          id: e.venue_id,
          name: e.venues.name,
          neighborhood: e.venues.neighborhood,
        });
      }
    }
    return result;
  }, [events]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((v) => v !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const hasSelection = selectedIds.length > 0;
  const firstName = hasSelection
    ? venues.find((v) => v.id === selectedIds[0])?.name ?? "Venue"
    : null;
  const overflowCount = selectedIds.length - 1;

  // Sorted: selected venues first, then rest
  const sortedVenues = useMemo(() => {
    const selected = venues.filter((v) => selectedIds.includes(v.id));
    const unselected = venues.filter((v) => !selectedIds.includes(v.id));
    return [...selected, ...unselected];
  }, [venues, selectedIds]);

  // Track which neighborhoods have already been shown to avoid duplicate text nodes
  const seenNeighborhoods = new Set<string>();

  const triggerLabel = hasSelection
    ? `${firstName}${overflowCount > 0 ? ` +${overflowCount} more` : ""}`
    : "Search venues";

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={triggerLabel}
            className={`rounded-full gap-1.5 text-xs font-body h-9 ${
              hasSelection
                ? "bg-primary/20 text-primary border border-primary/40 pr-2 pl-3"
                : "bg-card/90 backdrop-blur-md border border-border px-3 shadow-lg text-muted-foreground"
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline truncate max-w-[160px]">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 bg-card border-border" align="center">
          <Command>
            <CommandInput placeholder="Search venues..." />
            <CommandList>
              <CommandEmpty>No venues found.</CommandEmpty>
              {sortedVenues.map((venue) => {
                const showNeighborhood = !seenNeighborhoods.has(venue.neighborhood);
                if (showNeighborhood) seenNeighborhoods.add(venue.neighborhood);
                return (
                  <CommandItem
                    key={venue.id}
                    value={venue.name}
                    onSelect={() => toggle(venue.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.includes(venue.id)}
                      onCheckedChange={() => toggle(venue.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="flex-1 truncate text-sm">{venue.name}</span>
                    {showNeighborhood && (
                      <span className="text-xs text-muted-foreground">{venue.neighborhood}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {hasSelection && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear venue filter"
          className="h-9 w-9 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-lg text-muted-foreground"
          onClick={() => onChange([])}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
