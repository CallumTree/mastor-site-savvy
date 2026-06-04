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
  public: {
    Tables: {
      analysis_results: {
        Row: {
          analysis_json: Json
          created_at: string
          id: string
          project_id: string
          site_walk_id: string
        }
        Insert: {
          analysis_json: Json
          created_at?: string
          id?: string
          project_id: string
          site_walk_id: string
        }
        Update: {
          analysis_json?: Json
          created_at?: string
          id?: string
          project_id?: string
          site_walk_id?: string
        }
        Relationships: []
      }
      approved_findings: {
        Row: {
          analysis_id: string | null
          approved_at: string | null
          confidence: string | null
          created_at: string
          finding_text: string
          finding_type: string
          id: string
          original_text: string
          project_id: string
          site_walk_id: string | null
          status: string
        }
        Insert: {
          analysis_id?: string | null
          approved_at?: string | null
          confidence?: string | null
          created_at?: string
          finding_text: string
          finding_type: string
          id?: string
          original_text: string
          project_id: string
          site_walk_id?: string | null
          status?: string
        }
        Update: {
          analysis_id?: string | null
          approved_at?: string | null
          confidence?: string | null
          created_at?: string
          finding_text?: string
          finding_type?: string
          id?: string
          original_text?: string
          project_id?: string
          site_walk_id?: string | null
          status?: string
        }
        Relationships: []
      }
      contract_items: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          project_id: string
          total_qty: number | null
          unit: string | null
          unit_rate: number | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          total_qty?: number | null
          unit?: string | null
          unit_rate?: number | null
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          total_qty?: number | null
          unit?: string | null
          unit_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      potential_claims: {
        Row: {
          approved_at: string | null
          approved_finding_id: string | null
          claim_description: string | null
          claim_title: string
          confidence_score: string
          contract_value: number | null
          created_at: string
          id: string
          project_id: string
          rejected_at: string | null
          scope_element_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_finding_id?: string | null
          claim_description?: string | null
          claim_title: string
          confidence_score?: string
          contract_value?: number | null
          created_at?: string
          id?: string
          project_id: string
          rejected_at?: string | null
          scope_element_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_finding_id?: string | null
          claim_description?: string | null
          claim_title?: string
          confidence_score?: string
          contract_value?: number | null
          created_at?: string
          id?: string
          project_id?: string
          rejected_at?: string | null
          scope_element_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "potential_claims_approved_finding_id_fkey"
            columns: ["approved_finding_id"]
            isOneToOne: false
            referencedRelation: "approved_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potential_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potential_claims_scope_element_id_fkey"
            columns: ["scope_element_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_items: {
        Row: {
          created_at: string
          description: string | null
          estimated_cost: number | null
          id: string
          project_id: string
          quantity: number | null
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          project_id: string
          quantity?: number | null
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          project_id?: string
          quantity?: number | null
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_logs: {
        Row: {
          created_at: string
          id: string
          project_id: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          parsed_at: string | null
          project_id: string
          size_bytes: number | null
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          parsed_at?: string | null
          project_id: string
          size_bytes?: number | null
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          parsed_at?: string | null
          project_id?: string
          size_bytes?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client: string | null
          client_name: string | null
          contract_value: number | null
          created_at: string
          gross_value: number | null
          id: string
          location: string | null
          name: string
          progress: number
          site_address: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client?: string | null
          client_name?: string | null
          contract_value?: number | null
          created_at?: string
          gross_value?: number | null
          id?: string
          location?: string | null
          name: string
          progress?: number
          site_address?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          client?: string | null
          client_name?: string | null
          contract_value?: number | null
          created_at?: string
          gross_value?: number | null
          id?: string
          location?: string | null
          name?: string
          progress?: number
          site_address?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scope_elements: {
        Row: {
          confidence: string
          created_at: string
          description: string | null
          document_id: string | null
          element_type: string
          id: string
          parent_id: string | null
          project_id: string
          quantity: number | null
          source_reference: string | null
          title: string
          unit: string | null
        }
        Insert: {
          confidence?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          element_type: string
          id?: string
          parent_id?: string | null
          project_id: string
          quantity?: number | null
          source_reference?: string | null
          title: string
          unit?: string | null
        }
        Update: {
          confidence?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          element_type?: string
          id?: string
          parent_id?: string | null
          project_id?: string
          quantity?: number | null
          source_reference?: string | null
          title?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_elements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_elements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_elements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      site_walks: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          project_id: string
          title: string | null
          transcript: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          project_id: string
          title?: string | null
          transcript?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          project_id?: string
          title?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_walks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_basket_items: {
        Row: {
          claim_id: string | null
          created_at: string
          description: string | null
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "valuation_basket_items_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "potential_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_basket_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      valuation_items: {
        Row: {
          claimed_qty: number | null
          claimed_value: number | null
          contract_item_id: string
          id: string
          valuation_id: string
        }
        Insert: {
          claimed_qty?: number | null
          claimed_value?: number | null
          contract_item_id: string
          id?: string
          valuation_id: string
        }
        Update: {
          claimed_qty?: number | null
          claimed_value?: number | null
          contract_item_id?: string
          id?: string
          valuation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_items_contract_item_id_fkey"
            columns: ["contract_item_id"]
            isOneToOne: false
            referencedRelation: "contract_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valuation_items_valuation_id_fkey"
            columns: ["valuation_id"]
            isOneToOne: false
            referencedRelation: "valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      valuations: {
        Row: {
          created_at: string
          id: string
          project_id: string
          status: string
          valuation_date: string | null
          valuation_number: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          status?: string
          valuation_date?: string | null
          valuation_number?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          valuation_date?: string | null
          valuation_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "valuations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      variations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          project_id: string
          qty: number | null
          rate: number | null
          status: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          project_id: string
          qty?: number | null
          rate?: number | null
          status?: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string
          qty?: number | null
          rate?: number | null
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_owns_project: { Args: { _project_id: string }; Returns: boolean }
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
