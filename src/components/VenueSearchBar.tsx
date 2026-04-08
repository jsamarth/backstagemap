import { useState, useMemo, useEffect, useRef } from "react";
import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { EventWithVenue } from "@/types";
import { NEIGHBORHOOD_LABELS } from "@/types";

interface VenueSearchBarProps {
  events: EventWithVenue[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function VenueSearchBar({ events, selectedIds, onChange }: VenueSearchBarProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mobile, push the bar above the software keyboard when it appears.
  // Use rAF batching so rapid resize events don't cause jitter.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (window.innerWidth >= 640) return; // sm breakpoint — desktop unaffected
        const offset = window.innerHeight - vv.height - vv.offsetTop;
        setKeyboardOffset(Math.max(0, offset));
      });
    };

    vv.addEventListener("resize", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Reset offset when popover closes (keyboard dismissed)
  useEffect(() => {
    if (!open) setKeyboardOffset(0);
  }, [open]);

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

  // Reset search when popover closes; focus input when it opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  // Sorted: selected venues first, then rest; filtered by search
  const sortedVenues = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? venues.filter((v) => v.name.toLowerCase().includes(q) || v.neighborhood.toLowerCase().includes(q))
      : venues;
    const selected = filtered.filter((v) => selectedIds.includes(v.id));
    const unselected = filtered.filter((v) => !selectedIds.includes(v.id));
    return [...selected, ...unselected];
  }, [venues, selectedIds, search]);

  const triggerLabel = hasSelection
    ? `${firstName}${overflowCount > 0 ? ` +${overflowCount} more` : ""}`
    : "Search venues";

  return (
    <div
      className="absolute sm:top-4 sm:!bottom-auto sm:left-52 sm:translate-x-0 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-md border border-border px-3 py-2 shadow-lg"
      style={{ bottom: `calc(4rem + env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px)` }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={triggerLabel}
            className={`rounded-full gap-1.5 text-xs font-body ${
              hasSelection ? "bg-primary/20 text-primary" : "text-muted-foreground"
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="inline truncate max-w-[160px]">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 bg-card border-border" align="center" side="top" sideOffset={8}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              placeholder="Search venues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[96px] overflow-y-auto overflow-x-hidden p-1">
            {sortedVenues.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No venues found.</div>
            ) : (
              sortedVenues.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => toggle(venue.id)}
                  className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                >
                  <Checkbox
                    checked={selectedIds.includes(venue.id)}
                    onCheckedChange={() => toggle(venue.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="flex-1 truncate text-left">{venue.name}</span>
                  <span className="text-xs text-muted-foreground">{NEIGHBORHOOD_LABELS[venue.neighborhood as keyof typeof NEIGHBORHOOD_LABELS] ?? venue.neighborhood}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {hasSelection && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Clear venue filter"
          className="rounded-full text-xs text-red-400 hover:bg-red-50 hover:text-red-500"
          onClick={() => onChange([])}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
