export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          artist_name: string | null
          created_at: string
          date: string
          description: string | null
          event_name: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          parsed_at: string | null
          price_amount: number | null
          price_type: Database["public"]["Enums"]["price_type"]
          recurring: boolean
          source_url: string | null
          time_end: string | null
          time_start: string | null
          venue_id: string
        }
        Insert: {
          artist_name?: string | null
          created_at?: string
          date: string
          description?: string | null
          event_name: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          parsed_at?: string | null
          price_amount?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          recurring?: boolean
          source_url?: string | null
          time_end?: string | null
          time_start?: string | null
          venue_id: string
        }
        Update: {
          artist_name?: string | null
          created_at?: string
          date?: string
          description?: string | null
          event_name?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          parsed_at?: string | null
          price_amount?: number | null
          price_type?: Database["public"]["Enums"]["price_type"]
          recurring?: boolean
          source_url?: string | null
          time_end?: string | null
          time_start?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string
          created_at: string
          extracted_at: string | null
          google_maps_venue_id: string | null
          id: string
          last_scraped_at: string | null
          latitude: number
          longitude: number
          name: string
          neighborhood: Database["public"]["Enums"]["neighborhood"]
          raw_html_url: string | null
          scrape_status: Database["public"]["Enums"]["scrape_status"]
          venue_type: Database["public"]["Enums"]["venue_type"]
          website_url: string | null
        }
        Insert: {
          address: string
          created_at?: string
          extracted_at?: string | null
          google_maps_venue_id?: string | null
          id?: string
          last_scraped_at?: string | null
          latitude: number
          longitude: number
          name: string
          neighborhood: Database["public"]["Enums"]["neighborhood"]
          raw_html_url?: string | null
          scrape_status?: Database["public"]["Enums"]["scrape_status"]
          venue_type: Database["public"]["Enums"]["venue_type"]
          website_url?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          extracted_at?: string | null
          google_maps_venue_id?: string | null
          id?: string
          last_scraped_at?: string | null
          latitude?: number
          longitude?: number
          name?: string
          neighborhood?: Database["public"]["Enums"]["neighborhood"]
          raw_html_url?: string | null
          scrape_status?: Database["public"]["Enums"]["scrape_status"]
          venue_type?: Database["public"]["Enums"]["venue_type"]
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_event_view: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      increment_source_url_click: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      increment_event_upvote: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      increment_event_downvote: {
        Args: { p_event_id: string }
        Returns: undefined
      }
    }
    Enums: {
      event_type: "live_band" | "dj" | "open_mic" | "jam_session"
      neighborhood:
        | "williamsburg"
        | "bushwick"
        | "bed_stuy"
        | "east_village"
        | "west_village"
        | "chelsea"
        | "greenpoint"
      price_type: "free" | "cover" | "ticketed"
      scrape_status: "not_started" | "html_scraped" | "extracted"
      venue_type: "park" | "bar" | "cafe" | "performance_venue" | "club"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export type AnalyticsRpc = keyof DefaultSchema["Functions"];

export const Constants = {
  public: {
    Enums: {
      event_type: ["live_band", "dj", "open_mic", "jam_session"],
      neighborhood: [
        "williamsburg",
        "bushwick",
        "bed_stuy",
        "east_village",
        "west_village",
        "chelsea",
        "greenpoint",
      ],
      price_type: ["free", "cover", "ticketed"],
      scrape_status: ["not_started", "html_scraped", "extracted"],
      venue_type: ["park", "bar", "cafe", "performance_venue", "club"],
    },
  },
} as const
