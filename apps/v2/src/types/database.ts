// Hand-written subset of the Supabase database schema for W2.
// Replace with the output of `supabase gen types typescript` once the
// remote project is provisioned and migrations are applied.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          facebook_id: string;
          display_name: string;
          email: string | null;
          avatar_url: string | null;
          preferred_language: "ja" | "en" | "tl";
          prefecture_code: string;
          city_name: string;
          trial_started_at: string;
          trial_ends_at: string;
          onboarded_at: string | null;
          age_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          facebook_id: string;
          display_name: string;
          email?: string | null;
          avatar_url?: string | null;
          preferred_language?: "ja" | "en" | "tl";
          prefecture_code?: string;
          city_name?: string;
          trial_started_at?: string;
          trial_ends_at: string;
          onboarded_at?: string | null;
          age_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          facebook_id: string;
          display_name: string;
          email: string | null;
          avatar_url: string | null;
          preferred_language: "ja" | "en" | "tl";
          prefecture_code: string;
          city_name: string;
          onboarded_at: string | null;
          age_verified: boolean;
          updated_at: string;
        }>;
        Relationships: [];
      };
      consent_logs: {
        Row: {
          id: string;
          user_id: string;
          terms_version: string;
          privacy_version: string;
          age_verified: boolean;
          consented_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          terms_version: string;
          privacy_version: string;
          age_verified: boolean;
          consented_at?: string;
        };
        Update: Partial<{
          terms_version: string;
          privacy_version: string;
        }>;
        Relationships: [];
      };
      admin_roles: {
        Row: {
          id: string;
          user_id: string;
          role: "admin" | "editor";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: "admin" | "editor";
          created_at?: string;
        };
        Update: Partial<{
          role: "admin" | "editor";
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
