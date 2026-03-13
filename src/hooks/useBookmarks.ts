import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useBookmarks(user: User | null) {
  const queryClient = useQueryClient();

  const bookmarksQuery = useQuery({
    queryKey: ["bookmarks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*, events(*, venues(*))")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const addBookmark = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("bookmarks")
        .insert({ user_id: user!.id, event_id: eventId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const removeBookmark = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", user!.id)
        .eq("event_id", eventId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const isBookmarked = (eventId: string) =>
    bookmarksQuery.data?.some((b) => b.event_id === eventId) ?? false;

  return { bookmarks: bookmarksQuery.data ?? [], isBookmarked, addBookmark, removeBookmark, loading: bookmarksQuery.isLoading };
}
