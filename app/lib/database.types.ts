export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      article_authors: {
        Row: {
          article_id: string;
          created_at: string | null;
          id: string;
          is_corresponding: boolean | null;
          position: number | null;
          profile_id: string;
        };
        Insert: {
          article_id: string;
          created_at?: string | null;
          id?: string;
          is_corresponding?: boolean | null;
          position?: number | null;
          profile_id: string;
        };
        Update: {
          article_id?: string;
          created_at?: string | null;
          id?: string;
          is_corresponding?: boolean | null;
          position?: number | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_authors_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_authors_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      article_versions: {
        Row: {
          article_id: string;
          created_at: string | null;
          file_name: string;
          file_size: number | null;
          id: string;
          notes: string | null;
          storage_path: string;
          version_number: number;
        };
        Insert: {
          article_id: string;
          created_at?: string | null;
          file_name: string;
          file_size?: number | null;
          id?: string;
          notes?: string | null;
          storage_path: string;
          version_number: number;
        };
        Update: {
          article_id?: string;
          created_at?: string | null;
          file_name?: string;
          file_size?: number | null;
          id?: string;
          notes?: string | null;
          storage_path?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "article_versions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          author_id: string;
          created_at: string | null;
          current_version_id: string | null;
          description: string | null;
          id: string;
          status: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          created_at?: string | null;
          current_version_id?: string | null;
          description?: string | null;
          id?: string;
          status?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          created_at?: string | null;
          current_version_id?: string | null;
          description?: string | null;
          id?: string;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_current_version";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "article_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      board_posts: {
        Row: {
          author_id: string;
          content: string;
          created_at: string | null;
          id: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string | null;
          id?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string | null;
          id?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "board_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          article_id: string;
          author_id: string;
          body: string;
          created_at: string | null;
          id: string;
          parent_id: string | null;
          updated_at: string | null;
          version_id: string;
        };
        Insert: {
          article_id: string;
          author_id: string;
          body: string;
          created_at?: string | null;
          id?: string;
          parent_id?: string | null;
          updated_at?: string | null;
          version_id: string;
        };
        Update: {
          article_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string | null;
          id?: string;
          parent_id?: string | null;
          updated_at?: string | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      issue_articles: {
        Row: {
          article_id: string;
          created_at: string | null;
          id: string;
          issue_id: string;
          position: number | null;
        };
        Insert: {
          article_id: string;
          created_at?: string | null;
          id?: string;
          issue_id: string;
          position?: number | null;
        };
        Update: {
          article_id?: string;
          created_at?: string | null;
          id?: string;
          issue_id?: string;
          position?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "issue_articles_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issue_articles_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
        ];
      };
      issues: {
        Row: {
          cover_url: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          release_date: string | null;
          status: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          release_date?: string | null;
          status?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          release_date?: string | null;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          admin_type: string | null;
          avatar_url: string | null;
          created_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          intro: string | null;
          role_type: string | null;
          updated_at: string | null;
        };
        Insert: {
          admin_type?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          intro?: string | null;
          role_type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          admin_type?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          intro?: string | null;
          role_type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      qna_questions: {
        Row: {
          author_id: string;
          content: string;
          created_at: string | null;
          id: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string | null;
          id?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string | null;
          id?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qna_questions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      qna_replies: {
        Row: {
          author_id: string;
          content: string;
          created_at: string | null;
          id: string;
          question_id: string;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string | null;
          id?: string;
          question_id: string;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string | null;
          id?: string;
          question_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qna_replies_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qna_replies_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "qna_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      volume_issues: {
        Row: {
          created_at: string | null;
          id: string;
          issue_id: string;
          position: number | null;
          volume_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          issue_id: string;
          position?: number | null;
          volume_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          issue_id?: string;
          position?: number | null;
          volume_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "volume_issues_issue_id_fkey";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "volume_issues_volume_id_fkey";
            columns: ["volume_id"];
            isOneToOne: false;
            referencedRelation: "volumes";
            referencedColumns: ["id"];
          },
        ];
      };
      volumes: {
        Row: {
          cover_url: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          release_date: string | null;
          status: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          release_date?: string | null;
          status?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          release_date?: string | null;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
