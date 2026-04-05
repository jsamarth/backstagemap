import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EventWithVenue } from "@/types";

export function useEventDeepLink(
  eventId: string | null,
  venueId: string | null,
) {
  const eventQuery = useQuery({
    queryKey: ["event-deep-link", eventId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EventWithVenue | null> => {
      const { data, error } = await supabase
        .from("events")
        .select("*, venues(*)")
        .eq("id", eventId!)
        .maybeSingle();
      if (error) throw error;
      return (data as EventWithVenue) ?? null;
    },
    enabled: !!eventId,
  });

  const venueQuery = useQuery({
    queryKey: ["venue-deep-link", venueId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EventWithVenue[] | null> => {
      const { data, error } = await supabase
        .from("events")
        .select("*, venues(*)")
        .eq("venue_id", venueId!)
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (error) throw error;
      return (data as EventWithVenue[]) ?? null;
    },
    enabled: !!venueId,
  });

  return {
    event: eventQuery.data ?? null,
    venueEvents: venueQuery.data ?? null,
    isLoading: eventQuery.isLoading || venueQuery.isLoading,
    eventNotFound: eventQuery.isSuccess && !eventQuery.data,
    venueNotFound: false,
  };
}
