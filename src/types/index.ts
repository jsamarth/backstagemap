import type { Tables } from "@/integrations/supabase/types";
import { z } from 'zod'

export type Venue = Tables<"venues">;
export type Event = Tables<"events">;
export type Bookmark = Tables<"bookmarks">;

export type EventWithVenue = Event & {
  venues: Venue;
};

export type EventTypeKey = "live_band" | "dj" | "open_mic" | "jam_session";
export type NeighborhoodKey = "williamsburg" | "bushwick" | "bed_stuy" | "east_village" | "west_village" | "chelsea" | "greenpoint";
export type PriceTypeKey = "free" | "cover" | "ticketed";

export const EVENT_TYPE_LABELS: Record<EventTypeKey, string> = {
  live_band: "Live Band",
  dj: "DJ",
  open_mic: "Open Mic",
  jam_session: "Jam Session",
};

export const EVENT_TYPE_COLORS: Record<EventTypeKey, string> = {
  live_band: "bg-pin-live-band",
  dj: "bg-pin-dj",
  open_mic: "bg-pin-open-mic",
  jam_session: "bg-pin-jam-session",
};

export const EVENT_TYPE_HEX: Record<EventTypeKey, string> = {
  live_band: "#EC4899",
  dj: "#06B6D4",
  open_mic: "#F59E0B",
  jam_session: "#22C55E",
};

export const NEIGHBORHOOD_LABELS: Record<NeighborhoodKey, string> = {
  williamsburg: "Williamsburg",
  bushwick: "Bushwick",
  bed_stuy: "Bed-Stuy",
  east_village: "East Village",
  west_village: "West Village",
  chelsea: "Chelsea",
  greenpoint: "Greenpoint",
};

export const PRICE_TYPE_LABELS: Record<PriceTypeKey, string> = {
  free: "Free",
  cover: "Cover",
  ticketed: "Ticketed",
};

export interface FilterState {
  date: string | null;
  eventTypes: EventTypeKey[];
  priceTypes: PriceTypeKey[];
  timeOfDay: ("afternoon" | "evening" | "late_night")[];
  venueIds: string[];
}

// Shape of data returned by GPT-4o before upsert into `events`
export type ExtractedEvent = {
  event_name:   string
  artist_name:  string | null
  date:         string           // YYYY-MM-DD
  time_start:   string | null    // HH:MM 24-hour
  time_end:     string | null    // HH:MM 24-hour
  price_type:   PriceTypeKey
  price_amount: number | null
  description:  string | null
  event_type:   EventTypeKey
}

export const ExtractedEventSchema = z.object({
  event_name:   z.string().min(1).max(200),
  artist_name:  z.string().max(200).nullish(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_start:   z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  time_end:     z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  price_type:   z.enum(['free', 'cover', 'ticketed']),
  price_amount: z.number().min(0).max(10000).nullish(),
  description:  z.string().max(1000).nullish(),
  event_type:   z.enum(['live_band', 'dj', 'open_mic', 'jam_session']),
})

// Row type for `scrape_logs` table (not yet in generated types)
export type ScrapeLog = {
  id:         string
  venue_id:   string | null
  workflow:   'discovery' | 'html_scrape' | 'ai_parse' | 'freshness_reset'
  status:     'success' | 'failure'
  error:      string | null
  created_at: string
}
