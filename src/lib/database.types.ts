export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      cluster_members: {
        Row: {
          cluster_id: string
          intro_completed_at: string | null
          joined_at: string
          last_read_message_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          cluster_id: string
          intro_completed_at?: string | null
          joined_at?: string
          last_read_message_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          cluster_id?: string
          intro_completed_at?: string | null
          joined_at?: string
          last_read_message_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          created_at: string
          id: string
          introductions_completed_at: string | null
          introductions_deadline: string | null
          matching_mode: Database["public"]["Enums"]["matching_mode"]
          mode_label: string
          name: string
          queue_key: string
          status: Database["public"]["Enums"]["cluster_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          introductions_completed_at?: string | null
          introductions_deadline?: string | null
          matching_mode: Database["public"]["Enums"]["matching_mode"]
          mode_label: string
          name: string
          queue_key: string
          status?: Database["public"]["Enums"]["cluster_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          introductions_completed_at?: string | null
          introductions_deadline?: string | null
          matching_mode?: Database["public"]["Enums"]["matching_mode"]
          mode_label?: string
          name?: string
          queue_key?: string
          status?: Database["public"]["Enums"]["cluster_status"]
          updated_at?: string
        }
        Relationships: []
      }
      intro_answers: {
        Row: {
          answer: string
          cluster_id: string
          created_at: string
          question_id: number
          user_id: string
        }
        Insert: {
          answer: string
          cluster_id: string
          created_at?: string
          question_id: number
          user_id: string
        }
        Update: {
          answer?: string
          cluster_id?: string
          created_at?: string
          question_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intro_answers_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "intro_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intro_questions: {
        Row: {
          id: number
          position: number
          prompt: string
        }
        Insert: {
          id: number
          position: number
          prompt: string
        }
        Update: {
          id?: number
          position?: number
          prompt?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          cluster_id: string
          created_at: string
          expires_at: string
          id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          user_id: string
        }
        Insert: {
          cluster_id: string
          created_at?: string
          expires_at?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          user_id: string
        }
        Update: {
          cluster_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          cluster_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          image_url: string | null
          moderation_status: Database["public"]["Enums"]["image_moderation_status"]
          reply_to_id: string | null
        }
        Insert: {
          author_id: string
          cluster_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          moderation_status?: Database["public"]["Enums"]["image_moderation_status"]
          reply_to_id?: string | null
        }
        Update: {
          author_id?: string
          cluster_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          moderation_status?: Database["public"]["Enums"]["image_moderation_status"]
          reply_to_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mode_cooldowns: {
        Row: {
          available_at: string
          mode: Database["public"]["Enums"]["matching_mode"]
          user_id: string
        }
        Insert: {
          available_at: string
          mode: Database["public"]["Enums"]["matching_mode"]
          user_id: string
        }
        Update: {
          available_at?: string
          mode?: Database["public"]["Enums"]["matching_mode"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mode_cooldowns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          cluster_id: string
          invitations: boolean
          mentions: boolean
          messages: boolean
          reactions: boolean
          signals: boolean
          user_id: string
          votes: boolean
        }
        Insert: {
          cluster_id: string
          invitations?: boolean
          mentions?: boolean
          messages?: boolean
          reactions?: boolean
          signals?: boolean
          user_id: string
          votes?: boolean
        }
        Update: {
          cluster_id?: string
          invitations?: boolean
          mentions?: boolean
          messages?: boolean
          reactions?: boolean
          signals?: boolean
          user_id?: string
          votes?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          cluster_id: string | null
          created_at: string
          id: string
          payload: Json | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          cluster_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          cluster_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability: Database["public"]["Enums"]["availability"]
          avatar_url: string | null
          bio: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          country_code: string | null
          created_at: string
          current_status: string | null
          display_name: string
          dob: string | null
          email: string
          id: string
          latitude: number | null
          local_area: string | null
          local_radius_km: number | null
          longitude: number | null
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          availability?: Database["public"]["Enums"]["availability"]
          avatar_url?: string | null
          bio?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          country_code?: string | null
          created_at?: string
          current_status?: string | null
          display_name?: string
          dob?: string | null
          email: string
          id: string
          latitude?: number | null
          local_area?: string | null
          local_radius_km?: number | null
          longitude?: number | null
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          availability?: Database["public"]["Enums"]["availability"]
          avatar_url?: string | null
          bio?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          country_code?: string | null
          created_at?: string
          current_status?: string | null
          display_name?: string
          dob?: string | null
          email?: string
          id?: string
          latitude?: number | null
          local_area?: string | null
          local_radius_km?: number | null
          longitude?: number | null
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          id: number
          joined_at: string
          mode: Database["public"]["Enums"]["matching_mode"]
          queue_key: string
          user_id: string
        }
        Insert: {
          id?: never
          joined_at?: string
          mode: Database["public"]["Enums"]["matching_mode"]
          queue_key: string
          user_id: string
        }
        Update: {
          id?: never
          joined_at?: string
          mode?: Database["public"]["Enums"]["matching_mode"]
          queue_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_rounds: {
        Row: {
          attempts: number
          candidate_pool: string[] | null
          closed_reason: string | null
          cluster_id: string
          created_at: string
          declined_user_ids: string[]
          id: string
          invited_user_id: string | null
          mode: Database["public"]["Enums"]["matching_mode"]
          select_candidate_vote_id: string | null
          status: Database["public"]["Enums"]["replacement_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          candidate_pool?: string[] | null
          closed_reason?: string | null
          cluster_id: string
          created_at?: string
          declined_user_ids?: string[]
          id?: string
          invited_user_id?: string | null
          mode: Database["public"]["Enums"]["matching_mode"]
          select_candidate_vote_id?: string | null
          status?: Database["public"]["Enums"]["replacement_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          candidate_pool?: string[] | null
          closed_reason?: string | null
          cluster_id?: string
          created_at?: string
          declined_user_ids?: string[]
          id?: string
          invited_user_id?: string | null
          mode?: Database["public"]["Enums"]["matching_mode"]
          select_candidate_vote_id?: string | null
          status?: Database["public"]["Enums"]["replacement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_rounds_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_rounds_select_candidate_vote_id_fkey"
            columns: ["select_candidate_vote_id"]
            isOneToOne: false
            referencedRelation: "votes"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          cluster_id: string | null
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          target_user_id: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          target_user_id: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_replies: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          signal_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          signal_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_replies_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          author_id: string
          cluster_id: string
          created_at: string
          id: string
          prompt: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["signal_status"]
        }
        Insert: {
          author_id: string
          cluster_id: string
          created_at?: string
          id?: string
          prompt: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
        }
        Update: {
          author_id?: string
          cluster_id?: string
          created_at?: string
          id?: string
          prompt?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "signals_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_responses: {
        Row: {
          choice: string
          created_at: string
          user_id: string
          vote_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          user_id: string
          vote_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          user_id?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_responses_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "votes"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          closes_at: string
          cluster_id: string
          created_at: string
          id: string
          initiated_by: string
          name_suggestion: string | null
          result: Json | null
          status: Database["public"]["Enums"]["vote_status"]
          target_member_id: string | null
          type: Database["public"]["Enums"]["vote_type"]
        }
        Insert: {
          closes_at?: string
          cluster_id: string
          created_at?: string
          id?: string
          initiated_by: string
          name_suggestion?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["vote_status"]
          target_member_id?: string | null
          type: Database["public"]["Enums"]["vote_type"]
        }
        Update: {
          closes_at?: string
          cluster_id?: string
          created_at?: string
          id?: string
          initiated_by?: string
          name_suggestion?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["vote_status"]
          target_member_id?: string | null
          type?: Database["public"]["Enums"]["vote_type"]
        }
        Relationships: [
          {
            foreignKeyName: "votes_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_target_member_id_fkey"
            columns: ["target_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      advance_round_on_invitation_void: {
        Args: { p_cluster_id: string; p_user_id: string }
        Returns: undefined
      }
      check_intro_deadlines: { Args: never; Returns: undefined }
      close_expired_votes: { Args: never; Returns: undefined }
      cluster_unlocked: { Args: { p_cluster_id: string }; Returns: boolean }
      create_invitation: { Args: { p_round_id: string }; Returns: undefined }
      decline_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      delete_my_account: { Args: never; Returns: undefined }
      expire_invitations: { Args: never; Returns: undefined }
      fn_candidate_eligible: {
        Args: {
          p_cluster_id: string
          p_exclude: string[]
          p_mode: Database["public"]["Enums"]["matching_mode"]
          p_user_id: string
        }
        Returns: boolean
      }
      fn_mode_label: {
        Args: {
          p_key: string
          p_mode: Database["public"]["Enums"]["matching_mode"]
        }
        Returns: string
      }
      fn_queue_key: {
        Args: {
          p_area: string
          p_country: string
          p_dob: string
          p_mode: Database["public"]["Enums"]["matching_mode"]
          p_radius: number
        }
        Returns: string
      }
      fn_quorum: { Args: { p_active: number }; Returns: number }
      get_candidate_profiles: {
        Args: { p_round_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          user_id: string
        }[]
      }
      get_clusters_by_mode: {
        Args: { p_mode: Database["public"]["Enums"]["matching_mode"] }
        Returns: {
          created_at: string
          id: string
          matching_mode: Database["public"]["Enums"]["matching_mode"]
          member_count: number
          mode_label: string
          name: string
          status: Database["public"]["Enums"]["cluster_status"]
        }[]
      }
      get_intro_progress: {
        Args: { p_cluster_id: string }
        Returns: {
          display_name: string
          intro_completed_at: string
          user_id: string
        }[]
      }
      get_intro_questions: {
        Args: never
        Returns: {
          id: number
          position: number
          prompt: string
        }[]
      }
      get_member_profiles: {
        Args: { p_cluster_id: string }
        Returns: {
          availability: Database["public"]["Enums"]["availability"]
          avatar_url: string
          bio: string
          birth_year: number
          country_code: string
          current_status: string
          display_name: string
          id: string
          onboarding_completed_at: string
        }[]
      }
      get_my_clusters: {
        Args: never
        Returns: {
          created_at: string
          id: string
          introductions_completed_at: string
          introductions_deadline: string
          joined_at: string
          matching_mode: Database["public"]["Enums"]["matching_mode"]
          member_count: number
          mode_label: string
          name: string
          queue_key: string
          status: Database["public"]["Enums"]["cluster_status"]
          updated_at: string
        }[]
      }
      get_my_matching_status: {
        Args: never
        Returns: {
          cluster_id: string
          joined: boolean
          label: string
          mode: Database["public"]["Enums"]["matching_mode"]
          queue_key: string
          waiting: number
        }[]
      }
      get_my_notifications: {
        Args: never
        Returns: {
          body: string
          cluster_id: string
          created_at: string
          id: string
          payload: Json
          read_at: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }[]
      }
      get_my_queue_keys: {
        Args: never
        Returns: {
          mode: Database["public"]["Enums"]["matching_mode"]
          queue_key: string
          waiting: number
        }[]
      }
      get_pending_invitations: {
        Args: never
        Returns: {
          cluster_id: string
          cluster_name: string
          created_at: string
          expires_at: string
          id: string
          mode_label: string
        }[]
      }
      get_public_cluster_counts: {
        Args: never
        Returns: {
          cluster_count: number
          mode: Database["public"]["Enums"]["matching_mode"]
        }[]
      }
      get_queue_count: {
        Args: {
          p_mode: Database["public"]["Enums"]["matching_mode"]
          p_queue_key: string
        }
        Returns: number
      }
      get_replacement_round: {
        Args: { p_cluster_id: string }
        Returns: {
          attempts: number
          candidate_pool: string[]
          closed_reason: string
          cluster_id: string
          created_at: string
          declined_user_ids: string[]
          id: string
          invited_user_id: string
          mode: Database["public"]["Enums"]["matching_mode"]
          select_candidate_vote_id: string
          status: Database["public"]["Enums"]["replacement_status"]
          updated_at: string
        }[]
      }
      get_unread_notification_count: { Args: never; Returns: number }
      is_active_member: { Args: { p_cluster_id: string }; Returns: boolean }
      is_mentioned: {
        Args: { p_content: string; p_display_name: string }
        Returns: boolean
      }
      join_queue: {
        Args: {
          p_mode: Database["public"]["Enums"]["matching_mode"]
          p_radius_km?: number
        }
        Returns: {
          queue_key: string
          waiting: number
        }[]
      }
      leave_cluster: { Args: { p_cluster_id: string }; Returns: undefined }
      leave_queue: {
        Args: { p_mode: Database["public"]["Enums"]["matching_mode"] }
        Returns: undefined
      }
      mark_all_read: { Args: never; Returns: undefined }
      mark_cluster_read: { Args: { p_cluster_id: string }; Returns: undefined }
      maybe_form_cluster: {
        Args: {
          p_mode: Database["public"]["Enums"]["matching_mode"]
          p_queue_key: string
        }
        Returns: undefined
      }
      notification_allowed: {
        Args: {
          p_cluster_id: string
          p_pref: Database["public"]["Tables"]["notification_prefs"]["Row"]
          p_type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: boolean
      }
      progress_replacements: { Args: never; Returns: undefined }
      raise_signal: {
        Args: { p_cluster_id: string; p_prompt: string }
        Returns: string
      }
      reply_signal: {
        Args: { p_content: string; p_signal_id: string }
        Returns: undefined
      }
      report_member: {
        Args: {
          p_cluster_id: string
          p_details?: string
          p_reason: Database["public"]["Enums"]["report_reason"]
          p_target_user_id: string
        }
        Returns: string
      }
      send_message: {
        Args: { p_cluster_id: string; p_content?: string; p_image_url?: string }
        Returns: string
      }
      set_signal_status: {
        Args: {
          p_signal_id: string
          p_status: Database["public"]["Enums"]["signal_status"]
        }
        Returns: undefined
      }
      source_candidates: {
        Args: { p_round_id: string; p_system_user: string }
        Returns: undefined
      }
      start_name_vote: {
        Args: { p_cluster_id: string; p_name: string }
        Returns: string
      }
      start_replace_vote: {
        Args: { p_cluster_id: string; p_target_member_id: string }
        Returns: string
      }
      start_replacement: { Args: { p_cluster_id: string }; Returns: string }
      submit_intro_answers: {
        Args: { p_answers: Json; p_cluster_id: string }
        Returns: undefined
      }
      vote_on: {
        Args: { p_choice: string; p_vote_id: string }
        Returns: undefined
      }
    }
    Enums: {
      availability: "available" | "busy" | "dnd"
      cluster_status: "introductions" | "active" | "archived"
      image_moderation_status: "pending" | "approved" | "rejected"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      matching_mode:
        | "exact_birthdate"
        | "birth_year_month"
        | "birth_month"
        | "birth_year"
        | "local"
      notification_type:
        | "message"
        | "mention"
        | "reaction"
        | "vote_started"
        | "vote_result"
        | "cluster_formed"
        | "invitation_received"
        | "signal_new"
        | "replacement"
        | "unlocked"
        | "queue_update"
      replacement_status:
        | "selecting_candidates"
        | "voting"
        | "inviting"
        | "filled"
        | "closed"
      report_reason:
        | "harassment"
        | "hate_speech"
        | "spam"
        | "inappropriate_content"
        | "other"
      report_status: "pending" | "reviewing" | "actioned" | "dismissed"
      signal_status: "open" | "in_progress" | "resolved"
      vote_status: "open" | "closed"
      vote_type: "replace_member" | "change_name" | "select_candidate"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      availability: ["available", "busy", "dnd"],
      cluster_status: ["introductions", "active", "archived"],
      image_moderation_status: ["pending", "approved", "rejected"],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      matching_mode: [
        "exact_birthdate",
        "birth_year_month",
        "birth_month",
        "birth_year",
        "local",
      ],
      notification_type: [
        "message",
        "mention",
        "reaction",
        "vote_started",
        "vote_result",
        "cluster_formed",
        "invitation_received",
        "signal_new",
        "replacement",
        "unlocked",
        "queue_update",
      ],
      replacement_status: [
        "selecting_candidates",
        "voting",
        "inviting",
        "filled",
        "closed",
      ],
      report_reason: [
        "harassment",
        "hate_speech",
        "spam",
        "inappropriate_content",
        "other",
      ],
      report_status: ["pending", "reviewing", "actioned", "dismissed"],
      signal_status: ["open", "in_progress", "resolved"],
      vote_status: ["open", "closed"],
      vote_type: ["replace_member", "change_name", "select_candidate"],
    },
  },
} as const

