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
      claim_opportunities: {
        Row: {
          approved_at: string | null
          approved_finding_id: string | null
          claim_description: string | null
          claim_title: string | null
          claimed_value: number | null
          completion_percent: number | null
          confidence_score: string | null
          contract_value: number | null
          created_at: string
          finding_text: string | null
          id: string
          project_id: string
          quantity: number | null
          ready_to_claim_at: string | null
          rejected_at: string | null
          scope_element_id: string | null
          status: string
          unit_rate: number | null
          updated_at: string
          work_package_id: string | null
          work_package_name: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_finding_id?: string | null
          claim_description?: string | null
          claim_title?: string | null
          claimed_value?: number | null
          completion_percent?: number | null
          confidence_score?: string | null
          contract_value?: number | null
          created_at?: string
          finding_text?: string | null
          id?: string
          project_id: string
          quantity?: number | null
          ready_to_claim_at?: string | null
          rejected_at?: string | null
          scope_element_id?: string | null
          status?: string
          unit_rate?: number | null
          updated_at?: string
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_finding_id?: string | null
          claim_description?: string | null
          claim_title?: string | null
          claimed_value?: number | null
          completion_percent?: number | null
          confidence_score?: string | null
          contract_value?: number | null
          created_at?: string
          finding_text?: string | null
          id?: string
          project_id?: string
          quantity?: number | null
          ready_to_claim_at?: string | null
          rejected_at?: string | null
          scope_element_id?: string | null
          status?: string
          unit_rate?: number | null
          updated_at?: string
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_opportunities_approved_finding_id_fkey"
            columns: ["approved_finding_id"]
            isOneToOne: false
            referencedRelation: "approved_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_opportunities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_opportunities_scope_element_id_fkey"
            columns: ["scope_element_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_opportunities_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      claimable_elements_library: {
        Row: {
          confidence_score: number
          created_at: string
          description: string | null
          element_name: string
          id: string
          name_normalized: string | null
          sources: Json
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          element_name: string
          id?: string
          name_normalized?: string | null
          sources?: Json
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          element_name?: string
          id?: string
          name_normalized?: string | null
          sources?: Json
          trade?: string | null
          updated_at?: string
          user_id?: string
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
      invoices: {
        Row: {
          created_at: string
          id: string
          invoice_number: string
          project_id: string
          status: string
          total_amount: number
          updated_at: string
          valuation_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number: string
          project_id: string
          status?: string
          total_amount?: number
          updated_at?: string
          valuation_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string
          project_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
          valuation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_valuation_id_fkey"
            columns: ["valuation_id"]
            isOneToOne: false
            referencedRelation: "valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_merge_suggestions: {
        Row: {
          created_at: string
          duplicate_id: string
          id: string
          library_type: string
          primary_id: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duplicate_id: string
          id?: string
          library_type: string
          primary_id: string
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duplicate_id?: string
          id?: string
          library_type?: string
          primary_id?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      labour_activities_library: {
        Row: {
          activity_name: string
          confidence_score: number
          created_at: string
          id: string
          name_normalized: string | null
          sources: Json
          task_id: string | null
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_name: string
          confidence_score?: number
          created_at?: string
          id?: string
          name_normalized?: string | null
          sources?: Json
          task_id?: string | null
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_name?: string
          confidence_score?: number
          created_at?: string
          id?: string
          name_normalized?: string | null
          sources?: Json
          task_id?: string | null
          trade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labour_activities_library_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_library"
            referencedColumns: ["id"]
          },
        ]
      }
      material_prices: {
        Row: {
          confidence: string
          created_at: string
          id: string
          last_checked: string
          material_key: string
          material_name: string
          price: number
          source_type: string
          supplier_name: string
          unit: string | null
        }
        Insert: {
          confidence?: string
          created_at?: string
          id?: string
          last_checked?: string
          material_key: string
          material_name: string
          price: number
          source_type?: string
          supplier_name: string
          unit?: string | null
        }
        Update: {
          confidence?: string
          created_at?: string
          id?: string
          last_checked?: string
          material_key?: string
          material_name?: string
          price?: number
          source_type?: string
          supplier_name?: string
          unit?: string | null
        }
        Relationships: []
      }
      material_requirements: {
        Row: {
          confidence_score: string
          created_at: string
          estimated_quantity: number
          id: string
          material_name: string
          original_quantity: number | null
          project_id: string
          source_document: string
          source_reference: string
          source_task: string
          status: string
          unit: string
          updated_at: string
          work_package_id: string | null
        }
        Insert: {
          confidence_score?: string
          created_at?: string
          estimated_quantity?: number
          id?: string
          material_name: string
          original_quantity?: number | null
          project_id: string
          source_document?: string
          source_reference?: string
          source_task?: string
          status?: string
          unit?: string
          updated_at?: string
          work_package_id?: string | null
        }
        Update: {
          confidence_score?: string
          created_at?: string
          estimated_quantity?: number
          id?: string
          material_name?: string
          original_quantity?: number | null
          project_id?: string
          source_document?: string
          source_reference?: string
          source_task?: string
          status?: string
          unit?: string
          updated_at?: string
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      materials_library: {
        Row: {
          aliases: string[]
          category: string | null
          confidence_score: number
          created_at: string
          id: string
          material_name: string
          name_normalized: string | null
          sources: Json
          trade: string | null
          unit_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          material_name: string
          name_normalized?: string | null
          sources?: Json
          trade?: string | null
          unit_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[]
          category?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          material_name?: string
          name_normalized?: string | null
          sources?: Json
          trade?: string | null
          unit_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_quotes: {
        Row: {
          created_at: string
          id: string
          merchant_name: string
          notes: string | null
          project_id: string
          quote_value: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_name: string
          notes?: string | null
          project_id: string
          quote_value?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_name?: string
          notes?: string | null
          project_id?: string
          quote_value?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_price_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          package_id: string
          project_id: string
          quoted_price: number | null
          status: string
          supplier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          package_id: string
          project_id: string
          quoted_price?: number | null
          status?: string
          supplier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          package_id?: string
          project_id?: string
          quoted_price?: number | null
          status?: string
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_price_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "procurement_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_price_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      parse_jobs: {
        Row: {
          completion_tokens: number | null
          created_at: string
          document_id: string | null
          document_text: string | null
          error: string | null
          finished_at: string | null
          id: string
          project_id: string
          prompt_tokens: number | null
          result: Json | null
          started_at: string | null
          status: string
          stop_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          document_id?: string | null
          document_text?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          project_id: string
          prompt_tokens?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string
          stop_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          document_id?: string | null
          document_text?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          project_id?: string
          prompt_tokens?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string
          stop_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parse_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parse_jobs_project_id_fkey"
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
          ready_to_claim_at: string | null
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
          ready_to_claim_at?: string | null
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
          ready_to_claim_at?: string | null
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
          phase_order: number
          project_id: string
          quantity: number | null
          scope_element_id: string | null
          status: string
          supplier: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          phase_order?: number
          project_id: string
          quantity?: number | null
          scope_element_id?: string | null
          status?: string
          supplier?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          phase_order?: number
          project_id?: string
          quantity?: number | null
          scope_element_id?: string | null
          status?: string
          supplier?: string | null
          unit?: string | null
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
          {
            foreignKeyName: "procurement_items_scope_element_id_fkey"
            columns: ["scope_element_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_package_items: {
        Row: {
          created_at: string
          id: string
          material_name: string
          package_id: string
          procurement_item_id: string | null
          project_id: string
          quantity: number | null
          source_document: string | null
          source_scope_reference: string | null
          source_task: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_name: string
          package_id: string
          procurement_item_id?: string | null
          project_id: string
          quantity?: number | null
          source_document?: string | null
          source_scope_reference?: string | null
          source_task?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          material_name?: string
          package_id?: string
          procurement_item_id?: string | null
          project_id?: string
          quantity?: number | null
          source_document?: string | null
          source_scope_reference?: string | null
          source_task?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "procurement_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_package_items_procurement_item_id_fkey"
            columns: ["procurement_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_register"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_package_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_packages: {
        Row: {
          confidence_score: number
          created_at: string
          description: string | null
          id: string
          package_name: string
          project_id: string
          status: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          package_name: string
          project_id: string
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          package_name?: string
          project_id?: string
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_register: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          material_name: string
          notes: string | null
          project_id: string
          quantity: number | null
          source_document: string | null
          source_document_id: string | null
          source_scope_element_id: string | null
          source_scope_reference: string | null
          status: string
          trade: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          material_name: string
          notes?: string | null
          project_id: string
          quantity?: number | null
          source_document?: string | null
          source_document_id?: string | null
          source_scope_element_id?: string | null
          source_scope_reference?: string | null
          status?: string
          trade?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          material_name?: string
          notes?: string | null
          project_id?: string
          quantity?: number | null
          source_document?: string | null
          source_document_id?: string | null
          source_scope_element_id?: string | null
          source_scope_reference?: string | null
          status?: string
          trade?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_register_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_address_line1: string | null
          company_address_line2: string | null
          company_logo_url: string | null
          company_name: string
          company_postcode: string | null
          company_town: string | null
          created_at: string
          full_name: string
          trial_ends_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_address_line1?: string | null
          company_address_line2?: string | null
          company_logo_url?: string | null
          company_name: string
          company_postcode?: string | null
          company_town?: string | null
          created_at?: string
          full_name: string
          trial_ends_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_address_line1?: string | null
          company_address_line2?: string | null
          company_logo_url?: string | null
          company_name?: string
          company_postcode?: string | null
          company_town?: string | null
          created_at?: string
          full_name?: string
          trial_ends_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          last_parse_job_id: string | null
          parse_status: string
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
          last_parse_job_id?: string | null
          parse_status?: string
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
          last_parse_job_id?: string | null
          parse_status?: string
          parsed_at?: string | null
          project_id?: string
          size_bytes?: number | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_last_parse_job_id_fkey"
            columns: ["last_parse_job_id"]
            isOneToOne: false
            referencedRelation: "parse_jobs"
            referencedColumns: ["id"]
          },
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
      scope_element_history: {
        Row: {
          created_at: string
          event_type: string
          id: string
          invoice_id: string | null
          notes: string | null
          project_id: string
          rejection_reason: string | null
          scope_element_id: string | null
          valuation_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id: string
          rejection_reason?: string | null
          scope_element_id?: string | null
          valuation_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id?: string
          rejection_reason?: string | null
          scope_element_id?: string | null
          valuation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scope_element_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_element_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_element_history_scope_element_id_fkey"
            columns: ["scope_element_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_element_history_valuation_id_fkey"
            columns: ["valuation_id"]
            isOneToOne: false
            referencedRelation: "valuations"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_elements: {
        Row: {
          claimed_in_valuation: Json | null
          confidence: string
          created_at: string
          description: string | null
          document_id: string | null
          element_type: string
          id: string
          invoiced_in: Json | null
          parent_id: string | null
          project_id: string
          quantity: number | null
          source_reference: string | null
          status: string
          title: string
          total_cost: number | null
          unit: string | null
          unit_rate: number | null
        }
        Insert: {
          claimed_in_valuation?: Json | null
          confidence?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          element_type: string
          id?: string
          invoiced_in?: Json | null
          parent_id?: string | null
          project_id: string
          quantity?: number | null
          source_reference?: string | null
          status?: string
          title: string
          total_cost?: number | null
          unit?: string | null
          unit_rate?: number | null
        }
        Update: {
          claimed_in_valuation?: Json | null
          confidence?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          element_type?: string
          id?: string
          invoiced_in?: Json | null
          parent_id?: string | null
          project_id?: string
          quantity?: number | null
          source_reference?: string | null
          status?: string
          title?: string
          total_cost?: number | null
          unit?: string | null
          unit_rate?: number | null
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
      site_walk_photos: {
        Row: {
          ai_tags: Json | null
          annotated_photo_url: string | null
          annotated_storage_path: string | null
          annotations: Json | null
          created_at: string
          id: string
          linked_procurement_id: string | null
          linked_variation_id: string | null
          location_lat: number | null
          location_lng: number | null
          photo_url: string
          project_id: string
          site_walk_id: string
          storage_path: string | null
          timestamp_seconds: number
          transcript_context: string | null
        }
        Insert: {
          ai_tags?: Json | null
          annotated_photo_url?: string | null
          annotated_storage_path?: string | null
          annotations?: Json | null
          created_at?: string
          id?: string
          linked_procurement_id?: string | null
          linked_variation_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          photo_url: string
          project_id: string
          site_walk_id: string
          storage_path?: string | null
          timestamp_seconds?: number
          transcript_context?: string | null
        }
        Update: {
          ai_tags?: Json | null
          annotated_photo_url?: string | null
          annotated_storage_path?: string | null
          annotations?: Json | null
          created_at?: string
          id?: string
          linked_procurement_id?: string | null
          linked_variation_id?: string | null
          location_lat?: number | null
          location_lng?: number | null
          photo_url?: string
          project_id?: string
          site_walk_id?: string
          storage_path?: string | null
          timestamp_seconds?: number
          transcript_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_walk_photos_linked_procurement_id_fkey"
            columns: ["linked_procurement_id"]
            isOneToOne: false
            referencedRelation: "procurement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_walk_photos_linked_variation_id_fkey"
            columns: ["linked_variation_id"]
            isOneToOne: false
            referencedRelation: "variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_walk_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_walk_photos_site_walk_id_fkey"
            columns: ["site_walk_id"]
            isOneToOne: false
            referencedRelation: "site_walks"
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
          recording_type: string
          status: string
          title: string | null
          transcript: string | null
          video_path: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          project_id: string
          recording_type?: string
          status?: string
          title?: string | null
          transcript?: string | null
          video_path?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          project_id?: string
          recording_type?: string
          status?: string
          title?: string | null
          transcript?: string | null
          video_path?: string | null
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
      task_claimable_mappings: {
        Row: {
          claimable_id: string
          confidence_score: number
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          claimable_id: string
          confidence_score?: number
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          claimable_id?: string
          confidence_score?: number
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_claimable_mappings_claimable_id_fkey"
            columns: ["claimable_id"]
            isOneToOne: false
            referencedRelation: "claimable_elements_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_claimable_mappings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_library"
            referencedColumns: ["id"]
          },
        ]
      }
      task_material_mappings: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          material_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          material_id: string
          task_id: string
          user_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          material_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_material_mappings_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_material_mappings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_library"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks_library: {
        Row: {
          aliases: string[]
          confidence_score: number
          created_at: string
          description: string | null
          id: string
          name_normalized: string | null
          procurement_package: string | null
          sources: Json
          task_name: string
          trade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          name_normalized?: string | null
          procurement_package?: string | null
          sources?: Json
          task_name: string
          trade?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[]
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          name_normalized?: string | null
          procurement_package?: string | null
          sources?: Json
          task_name?: string
          trade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_accounts: {
        Row: {
          account_reference: string | null
          branch_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          merchant_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_reference?: string | null
          branch_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          merchant_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_reference?: string | null
          branch_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          merchant_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          analysis_count: number
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_count?: number
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_count?: number
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          claim_opportunity_id: string | null
          claimed_qty: number | null
          claimed_value: number | null
          contract_item_id: string | null
          created_at: string
          description: string | null
          id: string
          scope_element_id: string | null
          status: string
          unit_rate: number | null
          valuation_id: string
          work_package_id: string | null
          work_package_name: string | null
        }
        Insert: {
          claim_opportunity_id?: string | null
          claimed_qty?: number | null
          claimed_value?: number | null
          contract_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scope_element_id?: string | null
          status?: string
          unit_rate?: number | null
          valuation_id: string
          work_package_id?: string | null
          work_package_name?: string | null
        }
        Update: {
          claim_opportunity_id?: string | null
          claimed_qty?: number | null
          claimed_value?: number | null
          contract_item_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scope_element_id?: string | null
          status?: string
          unit_rate?: number | null
          valuation_id?: string
          work_package_id?: string | null
          work_package_name?: string | null
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
            foreignKeyName: "valuation_items_scope_element_id_fkey"
            columns: ["scope_element_id"]
            isOneToOne: false
            referencedRelation: "scope_elements"
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
      work_package_activities: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          work_package_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          work_package_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "labour_activities_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_activities_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_package_claimables: {
        Row: {
          claimable_id: string
          created_at: string
          id: string
          work_package_id: string
        }
        Insert: {
          claimable_id: string
          created_at?: string
          id?: string
          work_package_id: string
        }
        Update: {
          claimable_id?: string
          created_at?: string
          id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_claimables_claimable_id_fkey"
            columns: ["claimable_id"]
            isOneToOne: false
            referencedRelation: "claimable_elements_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_claimables_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_package_materials: {
        Row: {
          created_at: string
          id: string
          material_id: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_materials_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_package_procurement: {
        Row: {
          created_at: string
          id: string
          procurement_package_id: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          procurement_package_id: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          procurement_package_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_procurement_procurement_package_id_fkey"
            columns: ["procurement_package_id"]
            isOneToOne: false
            referencedRelation: "procurement_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_procurement_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_package_tasks: {
        Row: {
          created_at: string
          id: string
          task_id: string
          work_package_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          work_package_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          work_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_package_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_package_tasks_work_package_id_fkey"
            columns: ["work_package_id"]
            isOneToOne: false
            referencedRelation: "work_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      work_packages: {
        Row: {
          confidence_score: number
          created_at: string
          description: string | null
          id: string
          package_name: string
          project_id: string
          source_documents: Json
          status: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          package_name: string
          project_id: string
          source_documents?: Json
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          description?: string | null
          id?: string
          package_name?: string
          project_id?: string
          source_documents?: Json
          status?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_packages_project_id_fkey"
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
      user_owns_work_package: { Args: { _wp_id: string }; Returns: boolean }
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
