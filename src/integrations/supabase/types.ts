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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      ai_research_signals: {
        Row: {
          confidence_score: number
          created_at: string
          expires_at: string | null
          id: string
          is_processed: boolean
          key_factors: string[] | null
          price_target: number | null
          research_summary: string
          risk_level: string | null
          signal_date: string
          signal_type: string
          symbol: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_processed?: boolean
          key_factors?: string[] | null
          price_target?: number | null
          research_summary: string
          risk_level?: string | null
          signal_date?: string
          signal_type: string
          symbol: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          is_processed?: boolean
          key_factors?: string[] | null
          price_target?: number | null
          research_summary?: string
          risk_level?: string | null
          signal_date?: string
          signal_type?: string
          symbol?: string
        }
        Relationships: []
      }
      coins: {
        Row: {
          coingecko_coin_url: string | null
          created_at: string
          first_seen: string
          id: string
          manual_url: string | null
          name: string
          official_links: Json | null
          source: string | null
          status: Database["public"]["Enums"]["coin_status"]
          symbol: string
          updated_at: string
        }
        Insert: {
          coingecko_coin_url?: string | null
          created_at?: string
          first_seen?: string
          id?: string
          manual_url?: string | null
          name: string
          official_links?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["coin_status"]
          symbol: string
          updated_at?: string
        }
        Update: {
          coingecko_coin_url?: string | null
          created_at?: string
          first_seen?: string
          id?: string
          manual_url?: string | null
          name?: string
          official_links?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["coin_status"]
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      deep_analysis: {
        Row: {
          coin_id: string
          competitor_analysis: Json | null
          created_at: string
          financial_deep_dive: Json | null
          id: string
          partnership_analysis: Json | null
          red_flag_analysis: Json | null
          social_sentiment: Json | null
          team_deep_dive: Json | null
          updated_at: string
        }
        Insert: {
          coin_id: string
          competitor_analysis?: Json | null
          created_at?: string
          financial_deep_dive?: Json | null
          id?: string
          partnership_analysis?: Json | null
          red_flag_analysis?: Json | null
          social_sentiment?: Json | null
          team_deep_dive?: Json | null
          updated_at?: string
        }
        Update: {
          coin_id?: string
          competitor_analysis?: Json | null
          created_at?: string
          financial_deep_dive?: Json | null
          id?: string
          partnership_analysis?: Json | null
          red_flag_analysis?: Json | null
          social_sentiment?: Json | null
          team_deep_dive?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deep_analysis_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      facts: {
        Row: {
          as_of: string
          coin_id: string
          created_at: string
          extracted: Json
          id: string
          sources: Json | null
          updated_at: string
        }
        Insert: {
          as_of?: string
          coin_id: string
          created_at?: string
          extracted?: Json
          id?: string
          sources?: Json | null
          updated_at?: string
        }
        Update: {
          as_of?: string
          coin_id?: string
          created_at?: string
          extracted?: Json
          id?: string
          sources?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          coin_id: string
          content_excerpt: string | null
          content_hash: string | null
          content_text: string | null
          created_at: string
          fetched_at: string | null
          http_status: number | null
          id: string
          status: Database["public"]["Enums"]["page_status"]
          updated_at: string
          url: string
        }
        Insert: {
          coin_id: string
          content_excerpt?: string | null
          content_hash?: string | null
          content_text?: string | null
          created_at?: string
          fetched_at?: string | null
          http_status?: number | null
          id?: string
          status?: Database["public"]["Enums"]["page_status"]
          updated_at?: string
          url: string
        }
        Update: {
          coin_id?: string
          content_excerpt?: string | null
          content_hash?: string | null
          content_text?: string | null
          created_at?: string
          fetched_at?: string | null
          http_status?: number | null
          id?: string
          status?: Database["public"]["Enums"]["page_status"]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          as_of: string
          coin_id: string
          confidence: number
          created_at: string
          green_flags: Json | null
          id: string
          overall: number
          overall_cap: number | null
          penalties: number | null
          pillars: Json | null
          red_flags: Json | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          as_of?: string
          coin_id: string
          confidence?: number
          created_at?: string
          green_flags?: Json | null
          id?: string
          overall: number
          overall_cap?: number | null
          penalties?: number | null
          pillars?: Json | null
          red_flags?: Json | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          as_of?: string
          coin_id?: string
          confidence?: number
          created_at?: string
          green_flags?: Json | null
          id?: string
          overall?: number
          overall_cap?: number | null
          penalties?: number | null
          pillars?: Json | null
          red_flags?: Json | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_coin_id_fkey"
            columns: ["coin_id"]
            isOneToOne: false
            referencedRelation: "coins"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          allow_domains: string[] | null
          chatgpt_pro_api_key: string | null
          created_at: string
          hybrid_mode: boolean
          id: number
          strategy_version: string
          updated_at: string
          weights_json: Json
        }
        Insert: {
          allow_domains?: string[] | null
          chatgpt_pro_api_key?: string | null
          created_at?: string
          hybrid_mode?: boolean
          id?: number
          strategy_version?: string
          updated_at?: string
          weights_json?: Json
        }
        Update: {
          allow_domains?: string[] | null
          chatgpt_pro_api_key?: string | null
          created_at?: string
          hybrid_mode?: boolean
          id?: number
          strategy_version?: string
          updated_at?: string
          weights_json?: Json
        }
        Relationships: []
      }
      trades: {
        Row: {
          ai_research_summary: string | null
          ai_signal_confidence: number | null
          created_at: string
          entry_date: string
          entry_price: number
          exit_date: string | null
          exit_price: number | null
          id: string
          profit_loss: number | null
          profit_loss_percentage: number | null
          quantity: number
          status: string
          stop_loss: number | null
          strategy_id: string
          symbol: string
          take_profit: number | null
          trade_type: string
          updated_at: string
        }
        Insert: {
          ai_research_summary?: string | null
          ai_signal_confidence?: number | null
          created_at?: string
          entry_date?: string
          entry_price: number
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          profit_loss?: number | null
          profit_loss_percentage?: number | null
          quantity: number
          status?: string
          stop_loss?: number | null
          strategy_id: string
          symbol: string
          take_profit?: number | null
          trade_type: string
          updated_at?: string
        }
        Update: {
          ai_research_summary?: string | null
          ai_signal_confidence?: number | null
          created_at?: string
          entry_date?: string
          entry_price?: number
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          profit_loss?: number | null
          profit_loss_percentage?: number | null
          quantity?: number
          status?: string
          stop_loss?: number | null
          strategy_id?: string
          symbol?: string
          take_profit?: number | null
          trade_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "trading_strategies"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_strategies: {
        Row: {
          created_at: string
          current_balance: number
          description: string | null
          id: string
          initial_capital: number
          is_active: boolean
          losing_trades: number
          max_drawdown: number
          name: string
          sharpe_ratio: number | null
          total_profit_loss: number
          total_trades: number
          updated_at: string
          user_id: string
          win_rate: number
          winning_trades: number
        }
        Insert: {
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_capital?: number
          is_active?: boolean
          losing_trades?: number
          max_drawdown?: number
          name: string
          sharpe_ratio?: number | null
          total_profit_loss?: number
          total_trades?: number
          updated_at?: string
          user_id: string
          win_rate?: number
          winning_trades?: number
        }
        Update: {
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_capital?: number
          is_active?: boolean
          losing_trades?: number
          max_drawdown?: number
          name?: string
          sharpe_ratio?: number | null
          total_profit_loss?: number
          total_trades?: number
          updated_at?: string
          user_id?: string
          win_rate?: number
          winning_trades?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      coin_status:
        | "pending"
        | "processing"
        | "analyzed"
        | "failed"
        | "insufficient_data"
        | "retry_pending"
        | "deep_analysis_pending"
      page_status:
        | "pending"
        | "fetched"
        | "failed"
        | "empty"
        | "invalid_content"
        | "blocked"
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
      coin_status: [
        "pending",
        "processing",
        "analyzed",
        "failed",
        "insufficient_data",
        "retry_pending",
        "deep_analysis_pending",
      ],
      page_status: [
        "pending",
        "fetched",
        "failed",
        "empty",
        "invalid_content",
        "blocked",
      ],
    },
  },
} as const
