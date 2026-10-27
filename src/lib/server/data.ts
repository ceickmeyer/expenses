// Typed queries used by load functions and actions. All tables carry the `expenses_` prefix
// because the Supabase project is shared with other apps.

import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '#lib/database.types.ts';
import type {
	Account,
	AccountType,
	BudgetSettings,
	CostAmount,
	CostFrequency,
	CostItem,
	Entry,
	IncomeCategory,
	IncomeFrequency,
	IncomeSource,
	Month,
	Rate,
	Snapshot
} from '#lib/budget.ts';

export type DB = SupabaseClient<Database>;

export interface RateRow extends Rate {
	id: number;
}
export interface AmountRow extends CostAmount {
	id: number;
}
export interface SourceRow extends IncomeSource {
	sort_order: number;
	rates: RateRow[];
}
export interface CostRow extends CostItem {
	sort_order: number;
	amounts: AmountRow[];
}
export interface AccountRow extends Account {
	sort_order: number;
}
export interface EntryRow extends Entry {
	id: number;
	notes: string;
}
export interface SettingsRow extends BudgetSettings {
	/** Saved at least once from the settings page (setup checklist item 4). */
	configured: boolean;
}

export interface AppData {
	sources: SourceRow[];
	costs: CostRow[];
	accounts: AccountRow[];
	entries: EntryRow[];
	snapshots: Snapshot[];
	settings: SettingsRow;
	settingsExists: boolean;
}

function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
	if (result.error) error(500, result.error.message);
	return result.data as NonNullable<T>;
}

/** Create the settings row on first login (no-op afterwards) and return it. */
export async function ensureSettings(db: DB) {
	return check(await db.rpc('expenses_ensure_settings'));
}

/** Everything the app needs, in one round of parallel queries. Data is small: one person. */
export async function loadAppData(db: DB): Promise<AppData> {
	const [
		sources,
		rates,
		costs,
		amounts,
		accounts,
		entries,
		incomeActuals,
		costActuals,
		extras,
		snapshots,
		settings
	] = await Promise.all([
		db.from('expenses_income_sources').select('*').order('sort_order').order('id'),
		db.from('expenses_income_source_rates').select('*').order('effective_from'),
		db.from('expenses_cost_items').select('*').order('sort_order').order('id'),
		db.from('expenses_cost_item_amounts').select('*').order('effective_from'),
		db.from('expenses_accounts').select('*').order('sort_order').order('id'),
		db.from('expenses_entries').select('*').order('entry_date'),
		db.from('expenses_income_actuals').select('entry_id, income_source_id, amount_cents'),
		db.from('expenses_cost_actuals').select('entry_id, cost_item_id, amount_cents'),
		db.from('expenses_monthly_extras').select('entry_id, kind, name, amount_cents').order('id'),
		db.from('expenses_balance_snapshots').select('account_id, as_of, balance_cents'),
		db.from('expenses_settings').select('*').maybeSingle()
	]);

	const rateRows = check(rates);
	const amountRows = check(amounts);

	const entryRows: EntryRow[] = check(entries).map((e) => ({
		id: e.id,
		date: e.entry_date,
		notes: e.notes,
		discretionary_spent_cents: e.discretionary_spent_cents,
		income: {},
		costs: {},
		extras: []
	}));
	const byId = new Map(entryRows.map((e) => [e.id, e]));
	for (const a of check(incomeActuals)) {
		const e = byId.get(a.entry_id);
		if (e) e.income[a.income_source_id] = a.amount_cents;
	}
	for (const a of check(costActuals)) {
		const e = byId.get(a.entry_id);
		if (e) e.costs[a.cost_item_id] = a.amount_cents;
	}
	for (const x of check(extras)) {
		byId.get(x.entry_id)?.extras.push({
			kind: x.kind as 'income' | 'cost',
			name: x.name,
			amount_cents: x.amount_cents
		});
	}

	if (settings.error) error(500, settings.error.message);
	const s = settings.data;

	return {
		sources: check(sources).map((row) => ({
			id: row.id,
			name: row.name,
			category: row.category as IncomeCategory,
			frequency: row.frequency as IncomeFrequency,
			start_month: row.start_month,
			end_month: row.end_month,
			sort_order: row.sort_order,
			rates: rateRows
				.filter((r) => r.income_source_id === row.id)
				.map((r) => ({
					id: r.id,
					effective_from: r.effective_from,
					rate_cents: r.rate_cents,
					quantity: r.quantity,
					summer_quantity: r.summer_quantity
				}))
		})),
		costs: check(costs).map((row) => ({
			id: row.id,
			name: row.name,
			frequency: row.frequency as CostFrequency,
			due_month: row.due_month,
			is_tax: row.is_tax,
			is_variable: row.is_variable,
			start_month: row.start_month,
			end_month: row.end_month,
			sort_order: row.sort_order,
			amounts: amountRows
				.filter((a) => a.cost_item_id === row.id)
				.map((a) => ({ id: a.id, effective_from: a.effective_from, amount_cents: a.amount_cents }))
		})),
		accounts: check(accounts).map((row) => ({
			id: row.id,
			name: row.name,
			type: row.type as AccountType,
			counts_toward_spending: row.counts_toward_spending,
			archived: row.archived,
			sort_order: row.sort_order
		})),
		entries: entryRows,
		snapshots: check(snapshots),
		settings: {
			tutoring_cancellations_per_week: Number(s?.tutoring_cancellations_per_week ?? 0),
			dog_cancellations_per_week: Number(s?.dog_cancellations_per_week ?? 0),
			summer_tutoring_hours_per_week: Number(s?.summer_tutoring_hours_per_week ?? 0),
			summer_tutoring_rate_cents: Number(s?.summer_tutoring_rate_cents ?? 0),
			monthly_savings_goal_cents: Number(s?.monthly_savings_goal_cents ?? 0),
			reduced_weeks_by_month: normaliseReducedWeeks(s?.reduced_weeks_by_month),
			configured: s?.configured_at != null
		},
		settingsExists: s !== null
	};
}

function normaliseReducedWeeks(value: unknown): Record<string, number> {
	const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const out: Record<string, number> = {};
	for (let i = 1; i <= 12; i++) {
		const key = String(i).padStart(2, '0');
		out[key] = Number(source[key] ?? 0) || 0;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Writes

type Table = 'expenses_income_sources' | 'expenses_cost_items' | 'expenses_accounts';

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

export async function addCostItem(
	db: DB,
	input: {
		name: string;
		frequency: CostFrequency;
		amount_cents: number;
		start_month: Month;
		due_month: number | null;
		is_tax: boolean;
		is_variable: boolean;
	}
): Promise<number> {
	const sort_order = await nextSortOrder(db, 'expenses_cost_items');
	const item = check(
		await db
			.from('expenses_cost_items')
			.insert({
				name: input.name,
				frequency: input.frequency,
				due_month: input.frequency === 'annual' ? input.due_month : null,
				is_tax: input.is_tax,
				is_variable: input.is_variable,
				start_month: input.start_month,
				sort_order
			})
			.select('id')
			.single()
	);
	const amount = await db.from('expenses_cost_item_amounts').insert({
		cost_item_id: item.id,
		effective_from: input.start_month,
		amount_cents: input.amount_cents
	});
	if (amount.error) {
		await db.from('expenses_cost_items').delete().eq('id', item.id);
		error(500, amount.error.message);
	}
	return item.id;
}

export async function addIncomeSource(
	db: DB,
	input: {
		name: string;
		category: IncomeCategory;
		frequency: IncomeFrequency;
		rate_cents: number;
		quantity: number;
		summer_quantity: number;
		start_month: Month;
	}
): Promise<number> {
	const sort_order = await nextSortOrder(db, 'expenses_income_sources');
	const source = check(
		await db
			.from('expenses_income_sources')
			.insert({
				name: input.name,
				category: input.category,
				frequency: input.frequency,
				start_month: input.start_month,
				sort_order
			})
			.select('id')
			.single()
	);
	const rate = await db.from('expenses_income_source_rates').insert({
		income_source_id: source.id,
		effective_from: input.start_month,
		rate_cents: input.rate_cents,
		quantity: input.quantity,
		summer_quantity: input.summer_quantity
	});
	if (rate.error) {
		await db.from('expenses_income_sources').delete().eq('id', source.id);
		error(500, rate.error.message);
	}
	return source.id;
}

export async function addAccount(
	db: DB,
	input: { name: string; type: AccountType; counts_toward_spending: boolean }
): Promise<number> {
	const sort_order = await nextSortOrder(db, 'expenses_accounts');
	const row = check(
		await db
			.from('expenses_accounts')
			.insert({ ...input, sort_order })
			.select('id')
			.single()
	);
	return row.id;
}
