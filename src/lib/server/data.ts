// Typed queries used by load functions and actions. All tables carry the `expenses_` prefix
// because the Supabase project is shared with other apps.

import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.ts';
import type { Account, AccountType, Bill, BillFrequency, Checkin } from '#lib/budget.ts';

export type DB = SupabaseClient<Database>;

export interface AccountRow extends Account {
	sort_order: number;
}
export interface BillRow extends Bill {
	sort_order: number;
}
export interface CheckinRow extends Checkin {
	id: number;
	notes: string;
}

export interface AppData {
	accounts: AccountRow[];
	bills: BillRow[];
	checkins: CheckinRow[];
	settings: { monthly_savings_goal_cents: number };
	settingsExists: boolean;
}

function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
	if (result.error) error(500, result.error.message);
	return result.data as NonNullable<T>;
}

/** Create the settings row on first login (no-op afterwards). */
export async function ensureSettings(db: DB) {
	return check(await db.rpc('expenses_ensure_settings'));
}

/** Everything the app needs, in one round of parallel queries. Data is small: one person. */
export async function loadAppData(db: DB): Promise<AppData> {
	const [accounts, bills, checkins, balances, settings] = await Promise.all([
		db.from('expenses_accounts').select('*').order('sort_order').order('id'),
		db.from('expenses_bills').select('*').order('sort_order').order('id'),
		db.from('expenses_checkins').select('*').order('checkin_date'),
		db.from('expenses_balances').select('checkin_id, account_id, balance_cents'),
		db.from('expenses_settings').select('*').maybeSingle()
	]);

	const checkinRows: CheckinRow[] = check(checkins).map((c) => ({
		id: c.id,
		date: c.checkin_date,
		main_income_cents: c.main_income_cents,
		notes: c.notes,
		balances: {}
	}));
	const byId = new Map(checkinRows.map((c) => [c.id, c]));
	for (const b of check(balances)) {
		const c = byId.get(b.checkin_id);
		if (c) c.balances[b.account_id] = b.balance_cents;
	}

	if (settings.error) error(500, settings.error.message);

	return {
		accounts: check(accounts).map((row) => ({
			id: row.id,
			name: row.name,
			type: row.type as AccountType,
			counts_toward_spending: row.counts_toward_spending,
			archived: row.archived,
			sort_order: row.sort_order
		})),
		bills: check(bills).map((row) => ({
			id: row.id,
			name: row.name,
			amount_cents: row.amount_cents,
			frequency: row.frequency as BillFrequency,
			is_tax: row.is_tax,
			archived: row.archived,
			sort_order: row.sort_order
		})),
		checkins: checkinRows,
		settings: {
			monthly_savings_goal_cents: Number(settings.data?.monthly_savings_goal_cents ?? 0)
		},
		settingsExists: settings.data !== null
	};
}

// ---------------------------------------------------------------------------
// Writes

type Table = 'expenses_accounts' | 'expenses_bills';

export async function nextSortOrder(db: DB, table: Table): Promise<number> {
	const rows = check(
		await db.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1)
	);
	return (rows[0]?.sort_order ?? -1) + 1;
}

export async function reorder(db: DB, table: Table, ids: number[]): Promise<void> {
	const results = await Promise.all(
		ids.map((id, i) => db.from(table).update({ sort_order: i }).eq('id', id))
	);
	for (const r of results) check(r);
}
