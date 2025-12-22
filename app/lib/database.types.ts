// Database types for Supabase
// These will be generated from your Supabase schema
// For now, we'll define them manually

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          role_type: "mentor" | "mentee"
          admin_type: "admin" | "user"
          email: string | null
          full_name: string | null
          intro: string | null
          avatar_url: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          role_type?: "mentor" | "mentee"
          admin_type?: "admin" | "user"
          email?: string | null
          full_name?: string | null
          intro?: string | null
          avatar_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          role_type?: "mentor" | "mentee"
          admin_type?: "admin" | "user"
          email?: string | null
          full_name?: string | null
          intro?: string | null
          avatar_url?: string | null
        }
      }
      articles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          title: string
          author_id: string
          status: "draft" | "in_review" | "published"
          current_version_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          title: string
          author_id: string
          status?: "draft" | "in_review" | "published"
          current_version_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          title?: string
          author_id?: string
          status?: "draft" | "in_review" | "published"
          current_version_id?: string | null
        }
      }
      article_versions: {
        Row: {
          id: string
          created_at: string
          article_id: string
          version_number: number
          storage_path: string
          file_name: string
          file_size: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          article_id: string
          version_number: number
          storage_path: string
          file_name: string
          file_size?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          article_id?: string
          version_number?: number
          storage_path?: string
          file_name?: string
          file_size?: number | null
          notes?: string | null
        }
      }
      comments: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          article_id: string
          version_id: string
          author_id: string
          body: string
          parent_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          article_id: string
          version_id: string
          author_id: string
          body: string
          parent_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          article_id?: string
          version_id?: string
          author_id?: string
          body?: string
          parent_id?: string | null
        }
      }
      board_posts: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          title: string
          content: string
          author_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          title: string
          content: string
          author_id: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          title?: string
          content?: string
          author_id?: string
        }
      }
      qna_questions: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          title: string
          content: string
          author_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          title: string
          content: string
          author_id: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          title?: string
          content?: string
          author_id?: string
        }
      }
      qna_replies: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          question_id: string
          author_id: string
          content: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          question_id: string
          author_id: string
          content: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          question_id?: string
          author_id?: string
          content?: string
        }
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
  }
}
