import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useNeighborhoods() {
  return useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("neighborhood")
        .not("neighborhood", "is", null);
      if (error) throw error;
      const unique = [...new Set(data.map((r) => r.neighborhood as string))].sort();
      return unique;
    },
    staleTime: 1000 * 60 * 60,
  });
}
