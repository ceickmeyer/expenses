// Hand-written to match supabase/migrations. Regenerate with `npm run db:types` once the
// project is linked; the generated file replaces this one.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			expenses_accounts: {
				Row: {
					id: number;
					user_id: string;
					name: string;
					type: string;
					counts_toward_spending: boolean;
					sort_order: number;
					archived: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					name: string;
					type: string;
					counts_toward_spending?: boolean;
					sort_order?: number;
					archived?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					name?: string;
					type?: string;
					counts_toward_spending?: boolean;
					sort_order?: number;
					archived?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			expenses_balance_snapshots: {
				Row: {
					id: number;
					user_id: string;
					account_id: number;
					as_of: string;
					balance_cents: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					account_id: number;
					as_of: string;
					balance_cents: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					account_id?: number;
					as_of?: string;
					balance_cents?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_balance_snapshots_account_id_fkey';
						columns: ['account_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_accounts';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_income_sources: {
				Row: {
					id: number;
					user_id: string;
					name: string;
					category: string;
					frequency: string;
					start_month: string;
					end_month: string | null;
					sort_order: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					name: string;
					category: string;
					frequency: string;
					start_month: string;
					end_month?: string | null;
					sort_order?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					name?: string;
					category?: string;
					frequency?: string;
					start_month?: string;
					end_month?: string | null;
					sort_order?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			expenses_income_source_rates: {
				Row: {
					id: number;
					user_id: string;
					income_source_id: number;
					effective_from: string;
					rate_cents: number;
					quantity: number;
					summer_quantity: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					income_source_id: number;
					effective_from: string;
					rate_cents: number;
					quantity?: number;
					summer_quantity?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					income_source_id?: number;
					effective_from?: string;
					rate_cents?: number;
					quantity?: number;
					summer_quantity?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_income_source_rates_income_source_id_fkey';
						columns: ['income_source_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_income_sources';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_cost_items: {
				Row: {
					id: number;
					user_id: string;
					name: string;
					frequency: string;
					due_month: number | null;
					is_tax: boolean;
					is_variable: boolean;
					start_month: string;
					end_month: string | null;
					sort_order: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					name: string;
					frequency: string;
					due_month?: number | null;
					is_tax?: boolean;
					is_variable?: boolean;
					start_month: string;
					end_month?: string | null;
					sort_order?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					name?: string;
					frequency?: string;
					due_month?: number | null;
					is_tax?: boolean;
					is_variable?: boolean;
					start_month?: string;
					end_month?: string | null;
					sort_order?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			expenses_cost_item_amounts: {
				Row: {
					id: number;
					user_id: string;
					cost_item_id: number;
					effective_from: string;
					amount_cents: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					cost_item_id: number;
					effective_from: string;
					amount_cents: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					cost_item_id?: number;
					effective_from?: string;
					amount_cents?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_cost_item_amounts_cost_item_id_fkey';
						columns: ['cost_item_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_cost_items';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_entries: {
				Row: {
					id: number;
					user_id: string;
					entry_date: string;
					discretionary_spent_cents: number | null;
					notes: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					entry_date: string;
					discretionary_spent_cents?: number | null;
					notes?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					entry_date?: string;
					discretionary_spent_cents?: number | null;
					notes?: string;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			expenses_income_actuals: {
				Row: {
					id: number;
					user_id: string;
					entry_id: number;
					income_source_id: number;
					amount_cents: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					entry_id: number;
					income_source_id: number;
					amount_cents: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					entry_id?: number;
					income_source_id?: number;
					amount_cents?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_income_actuals_entry_id_fkey';
						columns: ['entry_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_entries';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'expenses_income_actuals_income_source_id_fkey';
						columns: ['income_source_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_income_sources';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_cost_actuals: {
				Row: {
					id: number;
					user_id: string;
					entry_id: number;
					cost_item_id: number;
					amount_cents: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					entry_id: number;
					cost_item_id: number;
					amount_cents: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					entry_id?: number;
					cost_item_id?: number;
					amount_cents?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_cost_actuals_cost_item_id_fkey';
						columns: ['cost_item_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_cost_items';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'expenses_cost_actuals_entry_id_fkey';
						columns: ['entry_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_entries';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_monthly_extras: {
				Row: {
					id: number;
					user_id: string;
					entry_id: number;
					kind: string;
					name: string;
					amount_cents: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: never;
					user_id?: string;
					entry_id: number;
					kind: string;
					name: string;
					amount_cents: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: never;
					user_id?: string;
					entry_id?: number;
					kind?: string;
					name?: string;
					amount_cents?: number;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'expenses_monthly_extras_entry_id_fkey';
						columns: ['entry_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_entries';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_settings: {
				Row: {
					user_id: string;
					tutoring_cancellations_per_week: number;
					dog_cancellations_per_week: number;
					summer_tutoring_hours_per_week: number;
					summer_tutoring_rate_cents: number;
					monthly_savings_goal_cents: number;
					reduced_weeks_by_month: Json;
					configured_at: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					user_id?: string;
					tutoring_cancellations_per_week?: number;
					dog_cancellations_per_week?: number;
					summer_tutoring_hours_per_week?: number;
					summer_tutoring_rate_cents?: number;
					monthly_savings_goal_cents?: number;
					reduced_weeks_by_month?: Json;
					configured_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					user_id?: string;
					tutoring_cancellations_per_week?: number;
					dog_cancellations_per_week?: number;
					summer_tutoring_hours_per_week?: number;
					summer_tutoring_rate_cents?: number;
					monthly_savings_goal_cents?: number;
					reduced_weeks_by_month?: Json;
					configured_at?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			expenses_ensure_settings: {
				Args: never;
				Returns: Database['public']['Tables']['expenses_settings']['Row'];
			};
			expenses_save_entry: {
				Args: { payload: Json };
				Returns: number;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
	PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
	PublicSchema['Tables'][T]['Update'];
