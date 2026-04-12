import { Calendar, Music, DollarSign, Clock, RotateCcw, Bookmark, MessageSquare, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import type { FilterState, EventTypeKey, PriceTypeKey, NeighborhoodKey } from "@/types";
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS, PRICE_TYPE_LABELS, NEIGHBORHOOD_LABELS } from "@/types";
import { format, addDays, nextSaturday, nextSunday } from "date-fns";

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onSavedClick: () => void;
  savedCount: number;
  onFeedbackClick: () => void;
}

export function FilterBar({ filters, onChange, onSavedClick, savedCount, onFeedbackClick }: FilterBarProps) {
  const today = new Date();
  const activeCount =
    (filters.date ? 1 : 0) +
    filters.neighborhoods.length +
    filters.eventTypes.length +
    filters.priceTypes.length +
    filters.timeOfDay.length;

  const clearAll = () =>
    onChange({ ...filters, date: null, neighborhoods: [], eventTypes: [], priceTypes: [], timeOfDay: [] });

  const setDate = (d: string | null) => onChange({ ...filters, date: d });

  const toggleArray = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-full bg-card/90 backdrop-blur-md border border-border px-3 py-2 shadow-lg max-w-[calc(100vw-7rem)] overflow-x-auto">
      {/* Neighborhood filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${filters.neighborhoods.length ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <MapPin className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{filters.neighborhoods.length ? `${filters.neighborhoods.length} area${filters.neighborhoods.length > 1 ? "s" : ""}` : "Area"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 bg-card border-border" align="start">
          <div className="space-y-2">
            {(Object.entries(NEIGHBORHOOD_LABELS) as [NeighborhoodKey, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={filters.neighborhoods.includes(key)} onCheckedChange={() => onChange({ ...filters, neighborhoods: toggleArray(filters.neighborhoods, key) })} />
                {label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${filters.date ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{filters.date ? format(new Date(filters.date + "T12:00:00"), "MMM d") : "Date"}</span>
            {filters.date && <span className="sm:hidden">{format(new Date(filters.date + "T12:00:00"), "MMM d")}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
          <div className="flex gap-1 p-2 border-b border-border">
            <Button variant="ghost" size="sm" className="text-xs rounded-full" onClick={() => setDate(format(today, "yyyy-MM-dd"))}>Today</Button>
            <Button variant="ghost" size="sm" className="text-xs rounded-full" onClick={() => setDate(format(addDays(today, 1), "yyyy-MM-dd"))}>Tomorrow</Button>
            <Button variant="ghost" size="sm" className="text-xs rounded-full" onClick={() => setDate(format(nextSaturday(today), "yyyy-MM-dd"))}>Sat</Button>
            <Button variant="ghost" size="sm" className="text-xs rounded-full" onClick={() => setDate(format(nextSunday(today), "yyyy-MM-dd"))}>Sun</Button>
          </div>
          <CalendarPicker mode="single" selected={filters.date ? new Date(filters.date + "T12:00:00") : undefined} onSelect={(d) => setDate(d ? format(d, "yyyy-MM-dd") : null)} />
          {filters.date && (
            <div className="p-2 border-t border-border">
              <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => setDate(null)}>Clear date</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Time of day filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${filters.timeOfDay.length ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Time</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-44 bg-card border-border" align="start">
          <div className="space-y-2">
            {([["afternoon", "Afternoon (12–6pm)"], ["evening", "Evening (6–11pm)"], ["late_night", "Late Night (11pm+)"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={filters.timeOfDay.includes(key)} onCheckedChange={() => onChange({ ...filters, timeOfDay: toggleArray([...filters.timeOfDay], key) })} />
                {label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Event type filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${filters.eventTypes.length ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <Music className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{filters.eventTypes.length ? `${filters.eventTypes.length} type${filters.eventTypes.length > 1 ? "s" : ""}` : "Type"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 bg-card border-border" align="start">
          <div className="space-y-2">
            {(Object.entries(EVENT_TYPE_LABELS) as [EventTypeKey, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={filters.eventTypes.includes(key)} onCheckedChange={() => onChange({ ...filters, eventTypes: toggleArray(filters.eventTypes, key) })} />
                <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_COLORS[key]}`} />
                {label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Price filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${filters.priceTypes.length ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
            <DollarSign className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{filters.priceTypes.length ? filters.priceTypes.map(p => PRICE_TYPE_LABELS[p]).join(", ") : "Price"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 bg-card border-border" align="start">
          <div className="space-y-2">
            {(Object.entries(PRICE_TYPE_LABELS) as [PriceTypeKey, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={filters.priceTypes.includes(key)} onCheckedChange={() => onChange({ ...filters, priceTypes: toggleArray(filters.priceTypes, key) })} />
                {label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="rounded-full text-xs text-red-400 hover:bg-red-50 hover:text-red-500" onClick={clearAll}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      )}

      <div className="w-px h-4 bg-border mx-1" />

      <Button variant="ghost" size="sm" className={`rounded-full gap-1.5 text-xs font-body ${savedCount > 0 ? "text-primary" : "text-muted-foreground"}`} onClick={onSavedClick}>
        <Bookmark className={`w-3.5 h-3.5 ${savedCount > 0 ? "fill-current" : ""}`} />
        <span className="hidden sm:inline">Saved{savedCount > 0 && ` (${savedCount})`}</span>
        {savedCount > 0 && <span className="sm:hidden">{savedCount}</span>}
      </Button>

      <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs font-body text-muted-foreground" onClick={onFeedbackClick}>
        <MessageSquare className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>
    </div>
  );
}
