import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EventWithVenue, FilterState } from "@/types";

export function useEvents(filters: FilterState) {
  return useQuery({
    queryKey: ["events", { date: filters.date, eventTypes: filters.eventTypes, priceTypes: filters.priceTypes, timeOfDay: filters.timeOfDay }],
    queryFn: async (): Promise<EventWithVenue[]> => {
      let query = supabase
        .from("events")
        .select("*, venues(*)")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (filters.date) {
        query = query.eq("date", filters.date);
      }

      if (filters.eventTypes.length > 0) {
        query = query.in("event_type", filters.eventTypes);
      }

      if (filters.priceTypes.length > 0) {
        query = query.in("price_type", filters.priceTypes);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results = (data as EventWithVenue[]) || [];

      // Client-side time-of-day filter
      if (filters.timeOfDay.length > 0) {
        results = results.filter((e) => {
          if (!e.time_start) return true;
          const hour = parseInt(e.time_start.split(":")[0], 10);
          if (filters.timeOfDay.includes("afternoon") && hour >= 12 && hour < 18) return true;
          if (filters.timeOfDay.includes("evening") && hour >= 18 && hour < 23) return true;
          if (filters.timeOfDay.includes("late_night") && (hour >= 23 || hour < 5)) return true;
          return false;
        });
      }

      return results;
    },
  });
}
