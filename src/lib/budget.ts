// Budget engine: pure functions from plain data to numbers. No Supabase, no Svelte.
// All money is in cents. Intermediate values may be fractional; round for display.

export type Month = string; // 'YYYY-MM-01'

export type IncomeCategory = 'tutoring' | 'dog_walking' | 'other';
export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';
export type CostFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';
export type AccountType =
	| 'checking'
	| 'savings'
	| 'tax_reserve'
	| 'investment'
	| 'credit_card'
	| 'other';

export interface Rate {
	effective_from: Month;
	rate_cents: number;
	quantity: number;
	summer_quantity: number;
}

export interface IncomeSource {
	id: number;
	name: string;
	category: IncomeCategory;
	frequency: IncomeFrequency;
	start_month: Month;
	end_month: Month | null;
	rates: Rate[];
}

export interface CostAmount {
	effective_from: Month;
	amount_cents: number;
}

export interface CostItem {
	id: number;
	name: string;
	frequency: CostFrequency;
	due_month: number | null;
	is_tax: boolean;
	is_variable: boolean;
	start_month: Month;
	end_month: Month | null;
	amounts: CostAmount[];
}

export interface BudgetSettings {
	tutoring_cancellations_per_week: number;
	dog_cancellations_per_week: number;
	summer_tutoring_hours_per_week: number;
	summer_tutoring_rate_cents: number;
	monthly_savings_goal_cents: number;
	/** Keyed "01".."12". */
	reduced_weeks_by_month: Record<string, number>;
}

export interface Extra {
	kind: 'income' | 'cost';
	name: string;
	amount_cents: number;
}

export interface Entry {
	month: Month;
	discretionary_spent_cents: number | null;
	/** income_source_id -> cents */
	income: Record<number, number>;
	/** cost_item_id -> cents */
	costs: Record<number, number>;
	extras: Extra[];
}

export interface Account {
	id: number;
	name: string;
	type: AccountType;
	counts_toward_spending: boolean;
	archived: boolean;
}

export interface Snapshot {
	account_id: number;
	month: Month;
	balance_cents: number;
}

export interface BudgetData {
	sources: IncomeSource[];
	costs: CostItem[];
	settings: BudgetSettings;
	entries: Entry[];
	accounts: Account[];
	snapshots: Snapshot[];
}

export const WEEKS_PER_YEAR = 52.18;

const FREQUENCY_WEEKS: Record<IncomeFrequency, number> = {
	weekly: 1,
	biweekly: 0.5,
	monthly: 12 / WEEKS_PER_YEAR
};

export const TAX_DUE_DATES: [month: number, day: number][] = [
	[1, 15],
	[4, 15],
	[6, 15],
	[9, 15]
];
const TAX_DUE_MONTHS = TAX_DUE_DATES.map(([m]) => m);

// ---------------------------------------------------------------------------
// Months

export function toMonth(year: number, month: number): Month {
	return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthOf(date: Date): Month {
	return toMonth(date.getFullYear(), date.getMonth() + 1);
}

function parts(m: Month): [year: number, month: number] {
	return [Number(m.slice(0, 4)), Number(m.slice(5, 7))];
}

export function calendarMonth(m: Month): number {
	return parts(m)[1];
}

function monthIndex(m: Month): number {
	const [y, mo] = parts(m);
	return y * 12 + (mo - 1);
}

export function addMonths(m: Month, n: number): Month {
	const i = monthIndex(m) + n;
	return toMonth(Math.floor(i / 12), (i % 12) + 1);
}

/** Number of months from `a` to `b` (positive when b is later). */
export function monthsBetween(a: Month, b: Month): number {
	return monthIndex(b) - monthIndex(a);
}

export function daysInMonth(m: Month): number {
	const [y, mo] = parts(m);
	return new Date(y, mo, 0).getDate();
}

export function weeksInMonth(m: Month): number {
	return daysInMonth(m) / 7;
}

export function monthRange(start: Month, count: number): Month[] {
	return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

// ---------------------------------------------------------------------------
// Resolving items for a month

export function isActive(item: { start_month: Month; end_month: Month | null }, m: Month): boolean {
	return item.start_month <= m && (item.end_month === null || m <= item.end_month);
}

/** The row with the latest effective_from on or before `m`. */
export function resolveAt<T extends { effective_from: Month }>(rows: T[], m: Month): T | undefined {
	let best: T | undefined;
	for (const row of rows) {
		if (row.effective_from <= m && (!best || row.effective_from > best.effective_from)) best = row;
	}
	return best;
}

export function amountAt(item: CostItem, m: Month): number {
	return resolveAt(item.amounts, m)?.amount_cents ?? 0;
}

// ---------------------------------------------------------------------------
// 6.1 Expected weekly income

interface WeekLine {
	category: IncomeCategory;
	rate: number;
	/** Sessions (or payments) per week: quantity × frequency factor. */
	units: number;
}

function weekLines(sources: IncomeSource[], m: Month, reduced: boolean): WeekLine[] {
	const lines: WeekLine[] = [];
	for (const source of sources) {
		if (!isActive(source, m)) continue;
		if (reduced && source.category === 'tutoring') continue; // replaced by summer hours
		const rate = resolveAt(source.rates, m);
		if (!rate) continue;
		const quantity = reduced ? rate.summer_quantity : rate.quantity;
		lines.push({
			category: source.category,
			rate: rate.rate_cents,
			units: quantity * FREQUENCY_WEEKS[source.frequency]
		});
	}
	return lines;
}

function gross(lines: WeekLine[]): number {
	return lines.reduce((sum, l) => sum + l.rate * l.units, 0);
}

/** Average rate per session for a category, weighted by sessions per week. */
function averageRate(lines: WeekLine[], category: IncomeCategory): number {
	const own = lines.filter((l) => l.category === category);
	const units = own.reduce((sum, l) => sum + l.units, 0);
	return units > 0 ? gross(own) / units : 0;
}

export function fullWeekIncome(sources: IncomeSource[], settings: BudgetSettings, m: Month): number {
	const lines = weekLines(sources, m, false);
	const total =
		gross(lines) -
		settings.tutoring_cancellations_per_week * averageRate(lines, 'tutoring') -
		settings.dog_cancellations_per_week * averageRate(lines, 'dog_walking');
	return Math.max(0, total);
}

export function reducedWeekIncome(
	sources: IncomeSource[],
	settings: BudgetSettings,
	m: Month
): number {
	const lines = weekLines(sources, m, true);
	const total =
		settings.summer_tutoring_hours_per_week * settings.summer_tutoring_rate_cents +
		gross(lines) -
		settings.dog_cancellations_per_week * averageRate(lines, 'dog_walking');
	return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// 6.2 Expected monthly income

export function reducedWeeksIn(settings: BudgetSettings, m: Month): number {
	const key = String(calendarMonth(m)).padStart(2, '0');
	const weeks = Number(settings.reduced_weeks_by_month[key] ?? 0) || 0;
	return Math.min(Math.max(weeks, 0), weeksInMonth(m));
}

export function expectedIncome(sources: IncomeSource[], settings: BudgetSettings, m: Month): number {
	const reduced = reducedWeeksIn(settings, m);
	return (
		(weeksInMonth(m) - reduced) * fullWeekIncome(sources, settings, m) +
		reduced * reducedWeekIncome(sources, settings, m)
	);
}

/**
 * Expected income per source for a month (prefills the entry form). Cancellations are
 * spread across each category in proportion to its sources, and summer tutoring hours
 * across the tutoring sources, so the values add up to `expectedIncome` whenever the month
 * has at least one tutoring source.
 */
export function expectedIncomeBySource(
	sources: IncomeSource[],
	settings: BudgetSettings,
	m: Month
): Map<number, number> {
	const reduced = reducedWeeksIn(settings, m);
	const full = weeksInMonth(m) - reduced;
	const fullLines = weekLines(sources, m, false);
	const reducedLines = weekLines(sources, m, true);

	// Net ÷ gross per category after cancellations.
	const scale = (lines: WeekLine[], category: IncomeCategory, cancellations: number) => {
		const total = gross(lines.filter((l) => l.category === category));
		if (total <= 0) return 0;
		return Math.max(0, total - cancellations * averageRate(lines, category)) / total;
	};
	const fullScale: Record<IncomeCategory, number> = {
		tutoring: scale(fullLines, 'tutoring', settings.tutoring_cancellations_per_week),
		dog_walking: scale(fullLines, 'dog_walking', settings.dog_cancellations_per_week),
		other: 1
	};
	const reducedScale: Record<IncomeCategory, number> = {
		tutoring: 0,
		dog_walking: scale(reducedLines, 'dog_walking', settings.dog_cancellations_per_week),
		other: 1
	};
	const summerTutoring =
		settings.summer_tutoring_hours_per_week * settings.summer_tutoring_rate_cents;
	const tutoringGross = gross(fullLines.filter((l) => l.category === 'tutoring'));

	const out = new Map<number, number>();
	for (const source of sources) {
		if (!isActive(source, m)) continue;
		const rate = resolveAt(source.rates, m);
		if (!rate) continue;
		const perUnit = rate.rate_cents * FREQUENCY_WEEKS[source.frequency];
		const fullWeek = perUnit * rate.quantity * fullScale[source.category];
		const reducedWeek =
			source.category === 'tutoring'
				? tutoringGross > 0
					? (summerTutoring * perUnit * rate.quantity) / tutoringGross
					: 0
				: perUnit * rate.summer_quantity * reducedScale[source.category];
		out.set(source.id, full * fullWeek + reduced * reducedWeek);
	}
	return out;
}

// ---------------------------------------------------------------------------
// 6.4 Costs

/** Whether a payment for this item falls in month `m` (ignores start/end). */
export function isPaymentMonth(item: CostItem, m: Month): boolean {
	switch (item.frequency) {
		case 'monthly':
			return true;
		case 'quarterly':
			if (item.is_tax) return TAX_DUE_MONTHS.includes(calendarMonth(m));
			return ((monthsBetween(item.start_month, m) % 3) + 3) % 3 === 0;
		case 'annual':
			return calendarMonth(m) === (item.due_month ?? calendarMonth(item.start_month));
		case 'one_time':
			return m === item.start_month;
	}
}

/**
 * Per-payment amount for `m`. Variable items use the average of the last three actuals
 * entered before `m` (in payment months), falling back to the set amount.
 */
export function paymentAmount(item: CostItem, entries: Entry[], m: Month): number {
	if (item.is_variable) {
		const recent = entries
			.filter((e) => e.month < m && item.id in e.costs && isPaymentMonth(item, e.month))
			.sort((a, b) => (a.month < b.month ? 1 : -1))
			.slice(0, 3);
		if (recent.length > 0) {
			return recent.reduce((sum, e) => sum + e.costs[item.id], 0) / recent.length;
		}
	}
	return amountAt(item, m);
}

/** The payment expected in month `m` — what the entry form prefills. */
export function costDue(item: CostItem, entries: Entry[], m: Month): number {
	if (!isActive(item, m) || !isPaymentMonth(item, m)) return 0;
	return paymentAmount(item, entries, m);
}

/**
 * Smoothed monthly cost used for the spending window: quarterly ÷ 3 and annual ÷ 12
 * every active month.
 */
export function costAccrued(item: CostItem, entries: Entry[], m: Month): number {
	if (!isActive(item, m)) return 0;
	if (item.frequency === 'quarterly') return paymentAmount(item, entries, m) / 3;
	if (item.frequency === 'annual') return paymentAmount(item, entries, m) / 12;
	return costDue(item, entries, m);
}

/** Cost used for the set-aside: quarterly smoothed, annual in full in its due month. */
export function costForSetAside(item: CostItem, entries: Entry[], m: Month): number {
	if (!isActive(item, m)) return 0;
	if (item.frequency === 'quarterly') return paymentAmount(item, entries, m) / 3;
	return costDue(item, entries, m);
}

export function entryIncome(entry: Entry): number {
	const regular = Object.values(entry.income).reduce((sum, v) => sum + v, 0);
	const extras = entry.extras.filter((x) => x.kind === 'income');
	return regular + extras.reduce((sum, x) => sum + x.amount_cents, 0);
}

export function entryCosts(entry: Entry): number {
	const regular = Object.values(entry.costs).reduce((sum, v) => sum + v, 0);
	const extras = entry.extras.filter((x) => x.kind === 'cost');
	return regular + extras.reduce((sum, x) => sum + x.amount_cents, 0);
}

// ---------------------------------------------------------------------------
// Per-month figures

export interface MonthFigures {
	month: Month;
	/** True when an entry exists and actuals were used. */
	actual: boolean;
	/** Actual income when entered, otherwise expected. */
	income: number;
	expectedIncome: number;
	/** Sum of payments expected this month (annual and quarterly in their due months). */
	expectedCosts: number;
	/** Actual costs when entered, including extras. */
	actualCosts: number | null;
	/** Smoothed costs used for the spending window. */
	windowCosts: number;
	/** Costs used for the set-aside (quarterly smoothed, annual in full). */
	setAsideCosts: number;
}

export function monthFigures(data: BudgetData, m: Month): MonthFigures {
	const { sources, costs, settings, entries } = data;
	const entry = entries.find((e) => e.month === m);
	const expIncome = expectedIncome(sources, settings, m);

	let expectedCosts = 0;
	let windowCosts = 0;
	let setAsideCosts = 0;
	for (const item of costs) {
		expectedCosts += costDue(item, entries, m);
		windowCosts += costAccrued(item, entries, m);
		setAsideCosts += costForSetAside(item, entries, m);
	}

	if (!entry) {
		return {
			month: m,
			actual: false,
			income: expIncome,
			expectedIncome: expIncome,
			expectedCosts,
			actualCosts: null,
			windowCosts,
			setAsideCosts
		};
	}

	// Actuals replace expected values. Lumpy payments (quarterly, annual) are swapped back
	// for their smoothed amounts so a tax payment landing inside the window isn't counted
	// on top of the accruals for the months around it.
	const actualCosts = entryCosts(entry);
	let actualWindow = actualCosts;
	let actualSetAside = actualCosts;
	for (const item of costs) {
		const paid = entry.costs[item.id] ?? 0;
		if (item.frequency === 'quarterly') {
			actualWindow += costAccrued(item, entries, m) - paid;
			actualSetAside += costForSetAside(item, entries, m) - paid;
		} else if (item.frequency === 'annual') {
			actualWindow += costAccrued(item, entries, m) - paid;
		}
	}

	return {
		month: m,
		actual: true,
		income: entryIncome(entry),
		expectedIncome: expIncome,
		expectedCosts,
		actualCosts,
		windowCosts: actualWindow,
		setAsideCosts: actualSetAside
	};
}

// ---------------------------------------------------------------------------
// 6.3 / 6.5 Annual projection and the spending window

/** The last 6 entered months plus following months to make 12. */
export function projectionWindow(entries: Entry[], today: Date): Month[] {
	if (entries.length === 0) return monthRange(monthOf(today), 12);
	const months = entries.map((e) => e.month).sort();
	const earliest = months[0];
	const latest = months[months.length - 1];
	const start = [addMonths(latest, -5), earliest].sort()[1];
	return monthRange(start, 12);
}

export interface Projection {
	months: MonthFigures[];
	annualIncome: number;
	annualCosts: number;
	annualSavings: number;
	annualDiscretionary: number;
	perMonth: number;
	perWeek: number;
	perDay: number;
}

export function projection(data: BudgetData, today: Date): Projection {
	const months = projectionWindow(data.entries, today).map((m) => monthFigures(data, m));
	const annualIncome = months.reduce((sum, f) => sum + f.income, 0);
	const annualCosts = months.reduce((sum, f) => sum + f.windowCosts, 0);
	const annualSavings = data.settings.monthly_savings_goal_cents * 12;
	const annualDiscretionary = annualIncome - annualCosts - annualSavings;
	return {
		months,
		annualIncome,
		annualCosts,
		annualSavings,
		annualDiscretionary,
		perMonth: annualDiscretionary / 12,
		perWeek: annualDiscretionary / WEEKS_PER_YEAR,
		perDay: annualDiscretionary / 365
	};
}

// ---------------------------------------------------------------------------
// 6.6 Seasonal reserve

/** Positive: move this much into savings. Negative: draw this much from the reserve. */
export function setAside(figures: MonthFigures, perMonth: number, settings: BudgetSettings): number {
	return figures.income - figures.setAsideCosts - perMonth - settings.monthly_savings_goal_cents;
}

export interface ReservePlan {
	months: { month: Month; setAside: number; cumulative: number }[];
	/** Largest cumulative drawdown over the next 12 months. */
	target: number;
}

export function reservePlan(data: BudgetData, from: Month, perMonth: number): ReservePlan {
	let cumulative = 0;
	let peak = 0;
	let target = 0;
	const months = monthRange(from, 12).map((m) => {
		const amount = setAside(monthFigures(data, m), perMonth, data.settings);
		cumulative += amount;
		peak = Math.max(peak, cumulative);
		target = Math.max(target, peak - cumulative);
		return { month: m, setAside: amount, cumulative };
	});
	return { months, target };
}

// ---------------------------------------------------------------------------
// 6.9 Reconciliation

export interface Reconciliation {
	month: Month;
	income: number;
	costs: number;
	actualChange: number;
	/** Entered discretionary spending, if any. */
	spent: number | null;
	/** Only when spending was entered: actual change minus expected change. */
	unaccounted: number | null;
	/** Only when spending was left blank: income − costs − actual change. */
	implied: number | null;
}

export function reconcile(data: BudgetData, m: Month): Reconciliation | null {
	const entry = data.entries.find((e) => e.month === m);
	if (!entry) return null;

	const prev = addMonths(m, -1);
	let actualChange = 0;
	let compared = 0;
	for (const account of data.accounts) {
		if (account.archived) continue;
		const now = data.snapshots.find((s) => s.account_id === account.id && s.month === m);
		const before = data.snapshots.find((s) => s.account_id === account.id && s.month === prev);
		if (!now || !before) continue;
		actualChange += now.balance_cents - before.balance_cents;
		compared++;
	}
	if (compared === 0) return null;

	const income = entryIncome(entry);
	const costs = entryCosts(entry);
	const spent = entry.discretionary_spent_cents;
	return {
		month: m,
		income,
		costs,
		actualChange,
		spent,
		unaccounted: spent === null ? null : actualChange - (income - costs - spent),
		implied: spent === null ? income - costs - actualChange : null
	};
}

// ---------------------------------------------------------------------------
// 6.7 Spending vs window

export interface SpendingResult {
	month: Month;
	spent: number;
	source: 'entered' | 'implied';
	/** perMonth − spent: positive means under the window. */
	difference: number;
}

export function spendingFor(data: BudgetData, m: Month, perMonth: number): SpendingResult | null {
	const entry = data.entries.find((e) => e.month === m);
	if (!entry) return null;
	if (entry.discretionary_spent_cents !== null) {
		const spent = entry.discretionary_spent_cents;
		return { month: m, spent, source: 'entered', difference: perMonth - spent };
	}
	const rec = reconcile(data, m);
	if (rec?.implied == null) return null;
	return { month: m, spent: rec.implied, source: 'implied', difference: perMonth - rec.implied };
}

/** Average difference over the last `count` entered months ending at `m` that have spending. */
export function averageSpendingDifference(
	data: BudgetData,
	m: Month,
	perMonth: number,
	count = 6
): { average: number; months: number } | null {
	const results = monthRange(addMonths(m, -(count - 1)), count)
		.map((month) => spendingFor(data, month, perMonth))
		.filter((r): r is SpendingResult => r !== null);
	if (results.length === 0) return null;
	const total = results.reduce((sum, r) => sum + r.difference, 0);
	return { average: total / results.length, months: results.length };
}

// ---------------------------------------------------------------------------
// 6.8 Tax reserve

function taxDates(today: Date): { last: Date; next: Date } {
	const year = today.getFullYear();
	const candidates: Date[] = [];
	for (const y of [year - 1, year, year + 1]) {
		for (const [mo, d] of TAX_DUE_DATES) candidates.push(new Date(y, mo - 1, d));
	}
	const day = new Date(year, today.getMonth(), today.getDate());
	const last = candidates.filter((c) => c <= day).at(-1)!;
	const next = candidates.find((c) => c > day)!;
	return { last, next };
}

export interface TaxStatus {
	lastDue: Date;
	nextDue: Date;
	monthsAccrued: number;
	/** Σ active is_tax quarterly amounts ÷ 3. */
	monthlyAccrual: number;
	/** Next quarterly payment (Σ active is_tax quarterly amounts). */
	nextPayment: number;
	needed: number;
	/** Latest tax reserve balance, or null when no tax reserve account has a balance. */
	balance: number | null;
	/** needed − balance; positive means short. */
	shortBy: number;
	onTrack: boolean;
}

export function taxStatus(data: BudgetData, today: Date): TaxStatus {
	const { last, next } = taxDates(today);
	const months =
		today.getFullYear() * 12 +
		today.getMonth() -
		(last.getFullYear() * 12 + last.getMonth()) -
		(today.getDate() < last.getDate() ? 1 : 0);
	const monthsAccrued = Math.max(0, months);

	const m = monthOf(today);
	const nextPayment = data.costs
		.filter((c) => c.is_tax && c.frequency === 'quarterly' && isActive(c, m))
		.reduce((sum, c) => sum + amountAt(c, m), 0);
	const monthlyAccrual = nextPayment / 3;
	const needed = monthsAccrued * monthlyAccrual;

	const reserves = data.accounts.filter((a) => a.type === 'tax_reserve' && !a.archived);
	let balance: number | null = null;
	for (const account of reserves) {
		const latest = latestSnapshot(data.snapshots, account.id);
		if (latest) balance = (balance ?? 0) + latest.balance_cents;
	}

	const shortBy = needed - (balance ?? 0);
	return {
		lastDue: last,
		nextDue: next,
		monthsAccrued,
		monthlyAccrual,
		nextPayment,
		needed,
		balance,
		shortBy,
		onTrack: shortBy <= 0
	};
}

// ---------------------------------------------------------------------------
// Balances

export function latestSnapshot(
	snapshots: Snapshot[],
	accountId: number,
	onOrBefore?: Month
): Snapshot | undefined {
	let best: Snapshot | undefined;
	for (const s of snapshots) {
		if (s.account_id !== accountId) continue;
		if (onOrBefore && s.month > onOrBefore) continue;
		if (!best || s.month > best.month) best = s;
	}
	return best;
}

export interface AccountBalance {
	account: Account;
	balance: number | null;
	month: Month | null;
	/** Change from the previous month's snapshot, when there is one. */
	change: number | null;
}

export function accountBalances(accounts: Account[], snapshots: Snapshot[]): AccountBalance[] {
	return accounts
		.filter((a) => !a.archived)
		.map((account) => {
			const latest = latestSnapshot(snapshots, account.id);
			if (!latest) return { account, balance: null, month: null, change: null };
			const prev = snapshots.find(
				(s) => s.account_id === account.id && s.month === addMonths(latest.month, -1)
			);
			return {
				account,
				balance: latest.balance_cents,
				month: latest.month,
				change: prev ? latest.balance_cents - prev.balance_cents : null
			};
		});
}

export function totalSpendable(balances: AccountBalance[]): number {
	return balances
		.filter((b) => b.account.counts_toward_spending)
		.reduce((sum, b) => sum + (b.balance ?? 0), 0);
}

/** Latest total across savings accounts — what the seasonal reserve is measured against. */
export function savingsTotal(balances: AccountBalance[]): number {
	return balances
		.filter((b) => b.account.type === 'savings')
		.reduce((sum, b) => sum + (b.balance ?? 0), 0);
}

// ---------------------------------------------------------------------------
// List totals

/** Smoothed monthly cost of the currently active items ("Regular costs: $5,250 a month"). */
export function monthlyCostTotal(costs: CostItem[], entries: Entry[], m: Month): number {
	return costs
		.filter((c) => c.frequency !== 'one_time')
		.reduce((sum, c) => sum + costAccrued(c, entries, m), 0);
}

/** Expected income per month at the full schedule for each active source. */
export function monthlyIncomeTotal(sources: IncomeSource[], m: Month): number {
	const perWeek = sources.reduce((sum, s) => {
		if (!isActive(s, m)) return sum;
		const rate = resolveAt(s.rates, m);
		return rate ? sum + rate.rate_cents * rate.quantity * FREQUENCY_WEEKS[s.frequency] : sum;
	}, 0);
	return (perWeek * WEEKS_PER_YEAR) / 12;
}
