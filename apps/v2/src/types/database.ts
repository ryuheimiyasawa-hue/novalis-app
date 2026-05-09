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
          updated_at: string;
        }>;
        Relationships: [];
      };
      consent_logs: {
        Row: {
          id: string;
          user_id: string;
          document_type: "terms" | "privacy";
          version: string;
          language: string;
          consented_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          document_type: "terms" | "privacy";
          version: string;
          language: string;
          consented_at?: string;
        };
        Update: Partial<{
          version: string;
          language: string;
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
