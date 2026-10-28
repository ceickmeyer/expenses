// Hand-written to match supabase/migrations. Regenerate with `npm run db:types` once the
// project is linked; the generated file replaces this one.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };
type Writable<Row, Required extends keyof Row> = Pick<Row, Required> &
	Partial<Omit<Row, Required | 'id'>> & { id?: never };

type AccountRow = {
	id: number;
	user_id: string;
	name: string;
	type: string;
	counts_toward_spending: boolean;
	sort_order: number;
	archived: boolean;
} & Timestamps;

type CheckinRow = {
	id: number;
	user_id: string;
	checkin_date: string;
	main_income_cents: number;
	notes: string;
} & Timestamps;

type BalanceRow = {
	id: number;
	user_id: string;
	checkin_id: number;
	account_id: number;
	balance_cents: number;
} & Timestamps;

type BillRow = {
	id: number;
	user_id: string;
	name: string;
	amount_cents: number;
	frequency: string;
	is_tax: boolean;
	sort_order: number;
	archived: boolean;
} & Timestamps;

type SettingsRow = {
	user_id: string;
	monthly_savings_goal_cents: number;
} & Timestamps;

export type Database = {
	public: {
		Tables: {
			expenses_accounts: {
				Row: AccountRow;
				Insert: Writable<AccountRow, 'name' | 'type'>;
				Update: Partial<Omit<AccountRow, 'id'>>;
				Relationships: [];
			};
			expenses_checkins: {
				Row: CheckinRow;
				Insert: Writable<CheckinRow, 'checkin_date'>;
				Update: Partial<Omit<CheckinRow, 'id'>>;
				Relationships: [];
			};
			expenses_balances: {
				Row: BalanceRow;
				Insert: Writable<BalanceRow, 'checkin_id' | 'account_id' | 'balance_cents'>;
				Update: Partial<Omit<BalanceRow, 'id'>>;
				Relationships: [
					{
						foreignKeyName: 'expenses_balances_checkin_id_fkey';
						columns: ['checkin_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_checkins';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'expenses_balances_account_id_fkey';
						columns: ['account_id'];
						isOneToOne: false;
						referencedRelation: 'expenses_accounts';
						referencedColumns: ['id'];
					}
				];
			};
			expenses_bills: {
				Row: BillRow;
				Insert: Writable<BillRow, 'name' | 'amount_cents' | 'frequency'>;
				Update: Partial<Omit<BillRow, 'id'>>;
				Relationships: [];
			};
			expenses_settings: {
				Row: SettingsRow;
				Insert: Partial<SettingsRow>;
				Update: Partial<SettingsRow>;
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: {
			expenses_ensure_settings: {
				Args: never;
				Returns: SettingsRow;
			};
			expenses_save_checkin: {
				Args: { payload: Json };
				Returns: number;
			};
		};
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
};
