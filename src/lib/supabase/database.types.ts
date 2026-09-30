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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_attempts: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          input_tokens: number | null
          kind: Database["public"]["Enums"]["ai_attempt_kind"]
          outcome: Database["public"]["Enums"]["ai_attempt_outcome"]
          output_tokens: number | null
          reason: string | null
          recipe_id: string | null
          source_url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          kind: Database["public"]["Enums"]["ai_attempt_kind"]
          outcome?: Database["public"]["Enums"]["ai_attempt_outcome"]
          output_tokens?: number | null
          reason?: string | null
          recipe_id?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          kind?: Database["public"]["Enums"]["ai_attempt_kind"]
          outcome?: Database["public"]["Enums"]["ai_attempt_outcome"]
          output_tokens?: number | null
          reason?: string | null
          recipe_id?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_attempts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_attempts_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          name: string
          position: number
          quantity: string | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          name: string
          position: number
          quantity?: string | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          name?: string
          position?: number
          quantity?: string | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          body: string
          position: number
          recipe_id: string
        }
        Insert: {
          body: string
          position: number
          recipe_id: string
        }
        Update: {
          body?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          added_by: string | null
          created_at: string
          extraction_method: Database["public"]["Enums"]["extraction_method"]
          id: string
          recipe_page_url: string | null
          source_channel_title: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_metadata_fetched_at: string | null
          source_title: string | null
          source_url: string
          source_url_key: string | null
          title: string
          updated_at: string
          youtube_video_id: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          extraction_method: Database["public"]["Enums"]["extraction_method"]
          id?: string
          recipe_page_url?: string | null
          source_channel_title?: string | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_metadata_fetched_at?: string | null
          source_title?: string | null
          source_url: string
          source_url_key?: string | null
          title: string
          updated_at?: string
          youtube_video_id?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          extraction_method?: Database["public"]["Enums"]["extraction_method"]
          id?: string
          recipe_page_url?: string | null
          source_channel_title?: string | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_metadata_fetched_at?: string | null
          source_title?: string | null
          source_url?: string
          source_url_key?: string | null
          title?: string
          updated_at?: string
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_recipes: {
        Row: {
          created_at: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "my_collection"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recipes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_collection: {
        Row: {
          added_at: string | null
          added_by: string | null
          created_at: string | null
          extraction_method:
            | Database["public"]["Enums"]["extraction_method"]
            | null
          id: string | null
          recipe_page_url: string | null
          source_channel_title: string | null
          source_kind: Database["public"]["Enums"]["source_kind"] | null
          source_metadata_fetched_at: string | null
          source_title: string | null
          source_url: string | null
          source_url_key: string | null
          title: string | null
          updated_at: string | null
          youtube_video_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      finish_ai_attempt: {
        Args: {
          p_attempt_id: string
          p_input_tokens: number
          p_outcome: Database["public"]["Enums"]["ai_attempt_outcome"]
          p_output_tokens: number
          p_reason: string
        }
        Returns: undefined
      }
      open_existing_recipe: {
        Args: {
          p_kind: Database["public"]["Enums"]["source_kind"]
          p_source_url: string
        }
        Returns: string
      }
      reserve_ai_attempt: {
        Args: {
          p_kind: Database["public"]["Enums"]["ai_attempt_kind"]
          p_source_url: string
        }
        Returns: string
      }
      save_recipe: {
        Args: {
          p_attempt_id: string
          p_input_tokens: number
          p_output_tokens: number
          p_payload: string
          p_signature: string
        }
        Returns: {
          out_created: boolean
          out_recipe_id: string
        }[]
      }
    }
    Enums: {
      ai_attempt_kind: "extract_web" | "extract_youtube" | "cook_pick"
      ai_attempt_outcome:
        | "started"
        | "recipe"
        | "not_a_recipe"
        | "insufficient"
        | "ingestion_failed"
      extraction_method:
        | "web_jsonld"
        | "web_model"
        | "youtube_recipe_page_jsonld"
        | "youtube_description"
        | "youtube_transcript"
      source_kind: "web" | "youtube"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_attempt_kind: ["extract_web", "extract_youtube", "cook_pick"],
      ai_attempt_outcome: [
        "started",
        "recipe",
        "not_a_recipe",
        "insufficient",
        "ingestion_failed",
      ],
      extraction_method: [
        "web_jsonld",
        "web_model",
        "youtube_recipe_page_jsonld",
        "youtube_description",
        "youtube_transcript",
      ],
      source_kind: ["web", "youtube"],
    },
  },
} as const
