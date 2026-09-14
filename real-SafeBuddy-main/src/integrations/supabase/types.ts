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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      buddy_availability: {
        Row: {
          common_routes: string[] | null
          created_at: string | null
          dest_lat: number | null
          dest_lng: number | null
          destination_location: string | null
          id: string
          is_available: boolean | null
          preferred_days: string[] | null
          preferred_times: string[] | null
          start_lat: number | null
          start_lng: number | null
          start_location: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          common_routes?: string[] | null
          created_at?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          destination_location?: string | null
          id?: string
          is_available?: boolean | null
          preferred_days?: string[] | null
          preferred_times?: string[] | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          common_routes?: string[] | null
          created_at?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          destination_location?: string | null
          id?: string
          is_available?: boolean | null
          preferred_days?: string[] | null
          preferred_times?: string[] | null
          start_lat?: number | null
          start_lng?: number | null
          start_location?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      buddy_matches: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      buddy_messages: {
        Row: {
          created_at: string
          id: string
          match_id: string
          message: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          message: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          message?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      map_points: {
        Row: {
          id: number
          owner_id: string | null
          title: string
          description: string | null
          report_type: string
          severity: string
          location: string
          upvotes: number | null
          is_verified: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          owner_id?: string | null
          title: string
          description?: string | null
          report_type: string
          severity: string
          location: string
          upvotes?: number | null
          is_verified?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          owner_id?: string | null
          title?: string
          description?: string | null
          report_type?: string
          severity?: string
          location?: string
          upvotes?: number | null
          is_verified?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          id: string
          is_verified: boolean | null
          languages: string[] | null
          last_username_change: string | null
          updated_at: string | null
          username: string | null
          verification_submitted_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          is_verified?: boolean | null
          languages?: string[] | null
          last_username_change?: string | null
          updated_at?: string | null
          username?: string | null
          verification_submitted_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_verified?: boolean | null
          languages?: string[] | null
          last_username_change?: string | null
          updated_at?: string | null
          username?: string | null
          verification_submitted_at?: string | null
        }
        Relationships: []
      }
      trip_shares: {
        Row: {
          alerted_at: string | null
          checked_in_at: string | null
          created_at: string
          destination: unknown | null
          destination_address: string | null
          ended_at: string | null
          expected_arrival: string | null
          id: string
          last_location: unknown | null
          last_location_at: string | null
          share_token: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          alerted_at?: string | null
          checked_in_at?: string | null
          created_at?: string
          destination?: unknown | null
          destination_address?: string | null
          ended_at?: string | null
          expected_arrival?: string | null
          id?: string
          last_location?: unknown | null
          last_location_at?: string | null
          share_token: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          alerted_at?: string | null
          checked_in_at?: string | null
          created_at?: string
          destination?: unknown | null
          destination_address?: string | null
          ended_at?: string | null
          expected_arrival?: string | null
          id?: string
          last_location?: unknown | null
          last_location_at?: string | null
          share_token?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      trip_locations: {
        Row: {
          id: number
          location: unknown
          recorded_at: string
          trip_share_id: string
        }
        Insert: {
          id?: number
          location: unknown
          recorded_at?: string
          trip_share_id: string
        }
        Update: {
          id?: number
          location?: unknown
          recorded_at?: string
          trip_share_id?: string
        }
        Relationships: []
      }
      trip_share_recipients: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          trip_share_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          trip_share_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          trip_share_id?: string
        }
        Relationships: []
      }
      trip_alerts: {
        Row: {
          contact_email: string | null
          contact_id: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          error: string | null
          id: string
          last_lat: number | null
          last_lng: number | null
          last_location_at: string | null
          sent_at: string | null
          status: string
          trip_share_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_id?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          error?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_location_at?: string | null
          sent_at?: string | null
          status?: string
          trip_share_id: string
        }
        Update: {
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          error?: string | null
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_location_at?: string | null
          sent_at?: string | null
          status?: string
          trip_share_id?: string
        }
        Relationships: []
      }
      report_likes: {
        Row: {
          created_at: string
          id: string
          report_id: string
          report_source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          report_source: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          report_source?: string
          user_id?: string
        }
        Relationships: []
      }
      safety_reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          location_address: string
          report_type: string
          severity: string
          time_of_day: string | null
          upvotes: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          location_address: string
          report_type: string
          severity: string
          time_of_day?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          location_address?: string
          report_type?: string
          severity?: string
          time_of_day?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      trusted_contacts: {
        Row: {
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_verifications: {
        Row: {
          created_at: string
          id: string
          id_document_url: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string | null
          submitted_at: string
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          id_document_url: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          submitted_at?: string
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          id?: string
          id_document_url?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string | null
          submitted_at?: string
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_reports_near_route: {
        Args: { route_geojson: Json; radius_meters?: number }
        Returns: {
          id: number
          label: string
          report_type: string
          severity: string
          lat: number
          lng: number
          distance_meters: number
          created_at: string
        }[]
      }
      get_shared_trip: {
        Args: { token: string }
        Returns: {
          status: string
          destination_address: string | null
          dest_lat: number | null
          dest_lng: number | null
          last_lat: number | null
          last_lng: number | null
          last_location_at: string | null
          started_at: string
          expected_arrival: string | null
          ended_at: string | null
          owner_name: string | null
        }[]
      }
      get_shared_trip_track: {
        Args: { token: string; max_points?: number }
        Returns: { lat: number; lng: number; recorded_at: string }[]
      }
      push_trip_location: {
        Args: { trip_id: string; lat: number; lng: number }
        Returns: undefined
      }
      check_in_trip: {
        Args: { trip_id: string }
        Returns: undefined
      }
      extend_trip: {
        Args: { trip_id: string; extra_minutes: number }
        Returns: string
      }
    }
    Enums: {
      verification_status: "pending" | "approved" | "rejected"
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

export const Constants = {
  public: {
    Enums: {
      verification_status: ["pending", "approved", "rejected"],
    },
  },
} as const
