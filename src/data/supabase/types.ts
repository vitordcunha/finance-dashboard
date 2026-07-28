export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          invite_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          invite_code?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          invite_code?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          household_id: string;
          user_id: string;
          role: 'owner' | 'member';
          created_at: string;
        };
        Insert: {
          household_id: string;
          user_id: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Update: {
          household_id?: string;
          user_id?: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      people: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          name: string;
          short_name: string;
          color: string;
          sort: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          name: string;
          short_name: string;
          color?: string;
          sort?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string | null;
          name?: string;
          short_name?: string;
          color?: string;
          sort?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'people_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      accounts: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: 'credit' | 'checking' | 'cash' | 'savings';
          person_id: string | null;
          color: string;
          credit_limit_cents: number;
          closing_day: number | null;
          due_day: number | null;
          archived: boolean;
          sort: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind?: 'credit' | 'checking' | 'cash' | 'savings';
          person_id?: string | null;
          color?: string;
          credit_limit_cents?: number;
          closing_day?: number | null;
          due_day?: number | null;
          archived?: boolean;
          sort?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['accounts']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'accounts_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          kind: 'income' | 'expense';
          parent_id: string | null;
          essential: boolean;
          color: string | null;
          sort: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          kind: 'income' | 'expense';
          parent_id?: string | null;
          essential?: boolean;
          color?: string | null;
          sort?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'categories_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_items: {
        Row: {
          id: string;
          household_id: string;
          kind: 'income' | 'expense';
          name: string;
          category_id: string | null;
          person_id: string | null;
          account_id: string | null;
          amount_cents: number;
          recurrence: 'monthly' | 'installment' | 'once';
          start_month: string;
          end_month: string | null;
          installments: number | null;
          interest_rate_bps: number | null;
          /** 1–31, clamped ao último dia do mês. 31 = último dia. */
          due_day: number | null;
          essential: boolean;
          estimated: boolean;
          archived: boolean;
          notes: string | null;
          sort: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          kind: 'income' | 'expense';
          name: string;
          category_id?: string | null;
          person_id?: string | null;
          account_id?: string | null;
          amount_cents?: number;
          recurrence?: 'monthly' | 'installment' | 'once';
          start_month: string;
          end_month?: string | null;
          installments?: number | null;
          due_day?: number | null;
          interest_rate_bps?: number | null;
          essential?: boolean;
          estimated?: boolean;
          archived?: boolean;
          notes?: string | null;
          sort?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['plan_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'plan_items_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_overrides: {
        Row: {
          plan_item_id: string;
          month: string;
          amount_cents: number;
          note: string | null;
        };
        Insert: {
          plan_item_id: string;
          month: string;
          amount_cents: number;
          note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['plan_overrides']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'plan_overrides_plan_item_id_fkey';
            columns: ['plan_item_id'];
            isOneToOne: false;
            referencedRelation: 'plan_items';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          date: string;
          competence_month: string;
          kind: 'income' | 'expense' | 'transfer';
          description: string;
          amount_cents: number;
          category_id: string | null;
          person_id: string | null;
          account_id: string | null;
          plan_item_id: string | null;
          installment_no: number | null;
          installment_total: number | null;
          installment_group: string | null;
          transfer_account_id: string | null;
          notes: string | null;
          tags: string[];
          source: 'manual' | 'import' | 'recurring' | 'telegram';
          external_id: string | null;
          status: 'actual' | 'planned' | 'skipped';
          recurrence: 'none' | 'monthly';
          recurrence_end: string | null;
          series_id: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          date: string;
          competence_month: string;
          kind: 'income' | 'expense' | 'transfer';
          description: string;
          amount_cents: number;
          category_id?: string | null;
          person_id?: string | null;
          account_id?: string | null;
          plan_item_id?: string | null;
          installment_no?: number | null;
          installment_total?: number | null;
          installment_group?: string | null;
          transfer_account_id?: string | null;
          notes?: string | null;
          tags?: string[];
          source?: 'manual' | 'import' | 'recurring' | 'telegram';
          external_id?: string | null;
          status?: 'actual' | 'planned' | 'skipped';
          recurrence?: 'none' | 'monthly';
          recurrence_end?: string | null;
          series_id?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'transactions_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      statements: {
        Row: {
          account_id: string;
          month: string;
          total_cents: number | null;
          paid_cents: number | null;
          closing_date: string | null;
          due_date: string | null;
          notes: string | null;
          status: 'open' | 'closed';
        };
        Insert: {
          account_id: string;
          month: string;
          total_cents?: number | null;
          paid_cents?: number | null;
          closing_date?: string | null;
          due_date?: string | null;
          notes?: string | null;
          status?: 'open' | 'closed';
        };
        Update: Partial<Database['public']['Tables']['statements']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'statements_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      statement_payments: {
        Row: {
          id: string;
          statement_account_id: string;
          statement_month: string;
          transaction_id: string;
          amount_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_account_id: string;
          statement_month: string;
          transaction_id: string;
          amount_cents: number;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['statement_payments']['Insert']
        >;
        Relationships: [
          {
            foreignKeyName: 'statement_payments_statement_account_id_statement_month_fkey';
            columns: ['statement_account_id', 'statement_month'];
            isOneToOne: false;
            referencedRelation: 'statements';
            referencedColumns: ['account_id', 'month'];
          },
          {
            foreignKeyName: 'statement_payments_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'transactions';
            referencedColumns: ['id'];
          },
        ];
      };
      account_balances: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          as_of_date: string;
          balance_cents: number;
          notes: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          as_of_date: string;
          balance_cents: number;
          notes?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['account_balances']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'account_balances_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_balances_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      month_closes: {
        Row: {
          household_id: string;
          month: string;
          real_balance_cents: number;
          notes: string | null;
          closed_at: string | null;
        };
        Insert: {
          household_id: string;
          month: string;
          real_balance_cents?: number;
          notes?: string | null;
          closed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['month_closes']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'month_closes_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          target_cents: number;
          saved_cents: number;
          person_id: string | null;
          deadline_month: string | null;
          priority: number;
          estimated: boolean;
          archived: boolean;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          target_cents?: number;
          saved_cents?: number;
          person_id?: string | null;
          deadline_month?: string | null;
          priority?: number;
          estimated?: boolean;
          archived?: boolean;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goals']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'goals_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goals_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_contributions: {
        Row: {
          id: string;
          goal_id: string;
          month: string;
          amount_cents: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          goal_id: string;
          month: string;
          amount_cents: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goal_contributions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'goal_contributions_goal_id_fkey';
            columns: ['goal_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          household_id: string;
          key: string;
          value: Json;
        };
        Insert: {
          household_id: string;
          key: string;
          value?: Json;
        };
        Update: Partial<Database['public']['Tables']['settings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'settings_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      import_batches: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          source: 'ofx' | 'csv';
          file_name: string;
          checksum: string | null;
          period_start: string | null;
          period_end: string | null;
          competence_month: string | null;
          status: 'pending' | 'reviewed' | 'applied';
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          source: 'ofx' | 'csv';
          file_name: string;
          checksum?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          competence_month?: string | null;
          status?: 'pending' | 'reviewed' | 'applied';
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['import_batches']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'import_batches_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'import_batches_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      import_lines: {
        Row: {
          id: string;
          batch_id: string;
          posted_on: string;
          amount_cents: number;
          description_raw: string;
          external_id: string | null;
          kind: 'expense' | 'income';
          status:
            | 'suggested'
            | 'matched'
            | 'created'
            | 'ignored'
            | 'unmatched';
          matched_transaction_id: string | null;
          created_transaction_id: string | null;
          match_confidence: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          posted_on: string;
          amount_cents: number;
          description_raw?: string;
          external_id?: string | null;
          kind?: 'expense' | 'income';
          status?:
            | 'suggested'
            | 'matched'
            | 'created'
            | 'ignored'
            | 'unmatched';
          matched_transaction_id?: string | null;
          created_transaction_id?: string | null;
          match_confidence?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['import_lines']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'import_lines_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'import_batches';
            referencedColumns: ['id'];
          },
        ];
      };
      categorization_rules: {
        Row: {
          id: string;
          household_id: string;
          fingerprint: string;
          match_example: string;
          category_id: string;
          person_id: string | null;
          hits: number;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          fingerprint: string;
          match_example?: string;
          category_id: string;
          person_id?: string | null;
          hits?: number;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['categorization_rules']['Insert']
        >;
        Relationships: [
          {
            foreignKeyName: 'categorization_rules_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categorization_rules_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categorization_rules_person_id_fkey';
            columns: ['person_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['id'];
          },
        ];
      };
      telegram_links: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          telegram_user_id: number;
          telegram_chat_id: number;
          default_account_id: string | null;
          linked_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          telegram_user_id: number;
          telegram_chat_id: number;
          default_account_id?: string | null;
          linked_at?: string;
          revoked_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['telegram_links']['Insert']>;
        Relationships: [];
      };
      telegram_link_codes: {
        Row: {
          id: string;
          code: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database['public']['Tables']['telegram_link_codes']['Insert']
        >;
        Relationships: [];
      };
      capture_drafts: {
        Row: {
          id: string;
          telegram_user_id: number;
          household_id: string;
          user_id: string;
          payload: Record<string, unknown>;
          status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
          last_transaction_id: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          telegram_user_id: number;
          household_id: string;
          user_id: string;
          payload?: Record<string, unknown>;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'expired';
          last_transaction_id?: string | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['capture_drafts']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_household: {
        Args: { p_name: string };
        Returns: Database['public']['Tables']['households']['Row'];
      };
      join_household: {
        Args: { p_invite_code: string };
        Returns: Database['public']['Tables']['households']['Row'];
      };
      get_my_household: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['households']['Row'];
      };
      is_household_member: {
        Args: { hid: string };
        Returns: boolean;
      };
      create_telegram_link_code: {
        Args: { p_person_id?: string | null; p_ttl_minutes?: number };
        Returns: Database['public']['Tables']['telegram_link_codes']['Row'];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type Household = Tables<'households'>;
export type Person = Tables<'people'>;
export type Account = Tables<'accounts'>;
export type Category = Tables<'categories'>;
export type TransactionRow = Tables<'transactions'>;
export type GoalRow = Tables<'goals'>;
export type GoalContributionRow = Tables<'goal_contributions'>;
export type ImportBatchRow = Tables<'import_batches'>;
export type ImportLineRow = Tables<'import_lines'>;
export type CategorizationRuleRow = Tables<'categorization_rules'>;
