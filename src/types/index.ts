import type { Tables } from "@/integrations/supabase/types";

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
}
