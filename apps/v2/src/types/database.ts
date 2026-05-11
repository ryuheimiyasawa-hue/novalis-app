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
          chat_retention_permanent: boolean;
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
          chat_retention_permanent?: boolean;
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
          chat_retention_permanent: boolean;
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
      conversations: {
        Row: {
          id: string;
          user_id: string;
          channel: "web" | "messenger";
          title: string | null;
          mode: "auto" | "operator";
          operator_user_id: string | null;
          operator_started_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel: "web" | "messenger";
          title?: string | null;
          mode?: "auto" | "operator";
          operator_user_id?: string | null;
          operator_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          title: string | null;
          mode: "auto" | "operator";
          operator_user_id: string | null;
          operator_started_at: string | null;
          updated_at: string;
        }>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant" | "operator" | "system";
          sender_user_id: string | null;
          content: string;
          is_escalated: boolean;
          whitelist_decision: object | null;
          citations: object;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant" | "operator" | "system";
          sender_user_id?: string | null;
          content: string;
          is_escalated?: boolean;
          whitelist_decision?: object | null;
          citations?: object;
          created_at?: string;
        };
        Update: Partial<{
          content: string;
          is_escalated: boolean;
          whitelist_decision: object | null;
          citations: object;
        }>;
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_usage: {
        Row: {
          id: string;
          user_id: string;
          period_yyyymm: string;
          message_count: number;
          last_reset_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period_yyyymm: string;
          message_count?: number;
          last_reset_at?: string;
        };
        Update: Partial<{
          message_count: number;
          last_reset_at: string;
        }>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: string;
          ends_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status: string;
          ends_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          status: string;
          ends_at: string | null;
        }>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          slug: string;
          name_ja: string;
          name_en: string;
          name_tl: string;
          icon: string | null;
          sort_order: number;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name_ja: string;
          name_en: string;
          name_tl: string;
          icon?: string | null;
          sort_order?: number;
          is_system?: boolean;
          created_at?: string;
        };
        Update: Partial<{
          slug: string;
          name_ja: string;
          name_en: string;
          name_tl: string;
          icon: string | null;
          sort_order: number;
          is_system: boolean;
        }>;
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          category_id: string | null;
          slug: string;
          status: "draft" | "published" | "archived";
          title_ja: string;
          title_en: string | null;
          title_tl: string | null;
          body_ja: string;
          body_en: string | null;
          body_tl: string | null;
          prefecture_code: string | null;
          city_name: string | null;
          author_id: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          slug: string;
          status?: "draft" | "published" | "archived";
          title_ja: string;
          title_en?: string | null;
          title_tl?: string | null;
          body_ja: string;
          body_en?: string | null;
          body_tl?: string | null;
          prefecture_code?: string | null;
          city_name?: string | null;
          author_id?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          category_id: string | null;
          slug: string;
          status: "draft" | "published" | "archived";
          title_ja: string;
          title_en: string | null;
          title_tl: string | null;
          body_ja: string;
          body_en: string | null;
          body_tl: string | null;
          prefecture_code: string | null;
          city_name: string | null;
          author_id: string | null;
          published_at: string | null;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      faqs: {
        Row: {
          id: string;
          category_id: string | null;
          question_ja: string;
          question_en: string | null;
          question_tl: string | null;
          answer_ja: string;
          answer_en: string | null;
          answer_tl: string | null;
          prefecture_code: string | null;
          is_published: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          question_ja: string;
          question_en?: string | null;
          question_tl?: string | null;
          answer_ja: string;
          answer_en?: string | null;
          answer_tl?: string | null;
          prefecture_code?: string | null;
          is_published?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<{
          category_id: string | null;
          question_ja: string;
          question_en: string | null;
          question_tl: string | null;
          answer_ja: string;
          answer_en: string | null;
          answer_tl: string | null;
          prefecture_code: string | null;
          is_published: boolean;
          sort_order: number;
          updated_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "faqs_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      experts: {
        Row: {
          id: string;
          name: string;
          title: string;
          specialty_ja: string | null;
          specialty_en: string | null;
          specialty_tl: string | null;
          bio_ja: string | null;
          bio_en: string | null;
          bio_tl: string | null;
          prefecture_code: string | null;
          city_name: string | null;
          avatar_url: string | null;
          calendar_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          title: string;
          specialty_ja?: string | null;
          specialty_en?: string | null;
          specialty_tl?: string | null;
          bio_ja?: string | null;
          bio_en?: string | null;
          bio_tl?: string | null;
          prefecture_code?: string | null;
          city_name?: string | null;
          avatar_url?: string | null;
          calendar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<{
          name: string;
          title: string;
          specialty_ja: string | null;
          specialty_en: string | null;
          specialty_tl: string | null;
          bio_ja: string | null;
          bio_en: string | null;
          bio_tl: string | null;
          prefecture_code: string | null;
          city_name: string | null;
          avatar_url: string | null;
          calendar_url: string | null;
          is_active: boolean;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      match_content: {
        Args: {
          query_embedding: number[];
          match_language: string;
          match_threshold?: number;
          match_count?: number;
        };
        Returns: Array<{
          source_type: string;
          source_id: string;
          language: string;
          chunk_text: string;
          similarity: number;
        }>;
      };
      increment_chat_usage: {
        Args: { p_user_id: string; p_period: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
