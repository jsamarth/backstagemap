import { supabase } from "@/integrations/supabase/client";
import type { AnalyticsRpc } from "@/integrations/supabase/types";

const VIEWED_KEY = (id: string) => `backstagemap_viewed_${id}`;
const RATED_KEY  = (id: string) => `backstagemap_rated_${id}`;

export function useEventAnalytics() {
  const trackView = async (eventId: string) => {
    if (localStorage.getItem(VIEWED_KEY(eventId))) return;
    await supabase.rpc("increment_event_view", { p_event_id: eventId });
    localStorage.setItem(VIEWED_KEY(eventId), "1");
  };

  const trackSourceClick = (eventId: string) =>
    supabase.rpc("increment_source_url_click", { p_event_id: eventId });

  const getRating = (eventId: string): "up" | "down" | null =>
    localStorage.getItem(RATED_KEY(eventId)) as "up" | "down" | null;

  const submitVote = async (eventId: string, vote: "up" | "down") => {
    if (getRating(eventId)) return;
    const rpc: AnalyticsRpc = vote === "up" ? "increment_event_upvote" : "increment_event_downvote";
    await supabase.rpc(rpc, { p_event_id: eventId });
    localStorage.setItem(RATED_KEY(eventId), vote);
  };

  return { trackView, trackSourceClick, getRating, submitVote };
}
