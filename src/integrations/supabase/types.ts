export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      ai_models: {
        Row: {
          api_endpoint: string | null
          configuration: Json | null
          created_at: string
          id: string
          is_fallback: boolean
          is_primary: boolean
          model_id: string
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          configuration?: Json | null
          created_at?: string
          id?: string
          is_fallback?: boolean
          is_primary?: boolean
          model_id: string
          name: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          configuration?: Json | null
          created_at?: string
          id?: string
          is_fallback?: boolean
          is_primary?: boolean
          model_id?: string
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          created_at: string
          enabled: boolean
          fallback_deepseek_claude_enabled: boolean
          fallback_openai_enabled: boolean
          id: string
          primary_model_provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fallback_deepseek_claude_enabled?: boolean
          fallback_openai_enabled?: boolean
          id?: string
          primary_model_provider?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fallback_deepseek_claude_enabled?: boolean
          fallback_openai_enabled?: boolean
          id?: string
          primary_model_provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          company_email: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          currency: string | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      communication_history: {
        Row: {
          communication_type: string
          content: string
          direction: string
          external_id: string | null
          id: string
          lead_id: string
          metadata: Json | null
          sent_at: string
          subject: string | null
        }
        Insert: {
          communication_type: string
          content: string
          direction: string
          external_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          sent_at?: string
          subject?: string | null
        }
        Update: {
          communication_type?: string
          content?: string
          direction?: string
          external_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          sent_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_templates: {
        Row: {
          created_at: string
          email_body: string
          email_subject: string
          id: string
          is_active: boolean
          name: string
          sequence_number: number
          sms_message: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_body: string
          email_subject: string
          id?: string
          is_active?: boolean
          name: string
          sequence_number: number
          sms_message: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_body?: string
          email_subject?: string
          id?: string
          is_active?: boolean
          name?: string
          sequence_number?: number
          sms_message?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_suggested_message: string | null
          created_at: string
          director_email: string
          director_first_name: string
          director_last_name: string
          director_phone_number: string | null
          discount_rate_dr: number | null
          early_bird_deadline: string | null
          ensemble_program_name: string | null
          estimated_performers: number | null
          follow_up_count: number
          form_submission_date: string
          id: string
          invoice_status: string | null
          last_communication_date: string | null
          last_email_sent_type: string | null
          last_reply_content: string | null
          last_sms_sent_type: string | null
          payment_date: string | null
          quickbooks_customer_id: string | null
          quickbooks_invoice_id: string | null
          quickbooks_invoice_number: string | null
          quickbooks_payment_link: string | null
          quote_sent_date: string | null
          raw_submission_data: Json | null
          reply_detected: boolean
          savings: number | null
          school_name: string | null
          season: string | null
          standard_rate_sr: number | null
          status: string
          updated_at: string
          workout_program_name: string | null
        }
        Insert: {
          ai_suggested_message?: string | null
          created_at?: string
          director_email: string
          director_first_name: string
          director_last_name: string
          director_phone_number?: string | null
          discount_rate_dr?: number | null
          early_bird_deadline?: string | null
          ensemble_program_name?: string | null
          estimated_performers?: number | null
          follow_up_count?: number
          form_submission_date?: string
          id?: string
          invoice_status?: string | null
          last_communication_date?: string | null
          last_email_sent_type?: string | null
          last_reply_content?: string | null
          last_sms_sent_type?: string | null
          payment_date?: string | null
          quickbooks_customer_id?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_invoice_number?: string | null
          quickbooks_payment_link?: string | null
          quote_sent_date?: string | null
          raw_submission_data?: Json | null
          reply_detected?: boolean
          savings?: number | null
          school_name?: string | null
          season?: string | null
          standard_rate_sr?: number | null
          status?: string
          updated_at?: string
          workout_program_name?: string | null
        }
        Update: {
          ai_suggested_message?: string | null
          created_at?: string
          director_email?: string
          director_first_name?: string
          director_last_name?: string
          director_phone_number?: string | null
          discount_rate_dr?: number | null
          early_bird_deadline?: string | null
          ensemble_program_name?: string | null
          estimated_performers?: number | null
          follow_up_count?: number
          form_submission_date?: string
          id?: string
          invoice_status?: string | null
          last_communication_date?: string | null
          last_email_sent_type?: string | null
          last_reply_content?: string | null
          last_sms_sent_type?: string | null
          payment_date?: string | null
          quickbooks_customer_id?: string | null
          quickbooks_invoice_id?: string | null
          quickbooks_invoice_number?: string | null
          quickbooks_payment_link?: string | null
          quote_sent_date?: string | null
          raw_submission_data?: Json | null
          reply_detected?: boolean
          savings?: number | null
          school_name?: string | null
          season?: string | null
          standard_rate_sr?: number | null
          status?: string
          updated_at?: string
          workout_program_name?: string | null
        }
        Relationships: []
      }
      n8n_workflows: {
        Row: {
          actions: string[] | null
          created_at: string
          description: string | null
          id: string
          last_run: string | null
          name: string
          status: string
          triggers: string[] | null
          updated_at: string
          webhook_url: string | null
          workflow_id: string
        }
        Insert: {
          actions?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          last_run?: string | null
          name: string
          status?: string
          triggers?: string[] | null
          updated_at?: string
          webhook_url?: string | null
          workflow_id: string
        }
        Update: {
          actions?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          last_run?: string | null
          name?: string
          status?: string
          triggers?: string[] | null
          updated_at?: string
          webhook_url?: string | null
          workflow_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          created_at: string
          email_notifications: boolean | null
          follow_up_reminders: boolean | null
          id: string
          new_lead_alerts: boolean | null
          payment_notifications: boolean | null
          sms_notifications: boolean | null
          system_alerts: boolean | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email_notifications?: boolean | null
          follow_up_reminders?: boolean | null
          id?: string
          new_lead_alerts?: boolean | null
          payment_notifications?: boolean | null
          sms_notifications?: boolean | null
          system_alerts?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email_notifications?: boolean | null
          follow_up_reminders?: boolean | null
          id?: string
          new_lead_alerts?: boolean | null
          payment_notifications?: boolean | null
          sms_notifications?: boolean | null
          system_alerts?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          bio: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          event_type: string
          executed_at: string
          id: string
          lead_id: string | null
          payload: Json | null
          results: Json | null
        }
        Insert: {
          event_type: string
          executed_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          results?: Json | null
        }
        Update: {
          event_type?: string
          executed_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json | null
          results?: Json | null
        }
        Relationships: []
      }
      zapier_integrations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          last_triggered: string | null
          name: string
          status: string
          trigger_type: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          last_triggered?: string | null
          name: string
          status?: string
          trigger_type: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          last_triggered?: string | null
          name?: string
          status?: string
          trigger_type?: string
          updated_at?: string
          webhook_url?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const