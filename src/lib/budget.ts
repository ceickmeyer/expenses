// Budget engine: pure functions from plain data to numbers. No Supabase, no Svelte.
// All money is in cents. Intermediate values may be fractional; round for display.

export type Month = string; // 'YYYY-MM-01'
export type Day = string; // 'YYYY-MM-DD'

export type IncomeCategory = 'tutoring' | 'dog_walking' | 'other';
export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';
export type CostFrequency = 'monthly' | 'quarterly' | 'annual' | 'one_time';
export type AccountType =
	'checking' | 'savings' | 'tax_reserve' | 'investment' | 'credit_card' | 'other';

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

/**
 * A dated check-in: balances as of `date`, and income, costs and spending since the
 * previous entry (see `entryPeriod`).
 */
export interface Entry {
	date: Day;
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
	as_of: Day;
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
// Days

export function toDay(date: Date): Day {
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${m}-${d}`;
}

function dayNumber(d: Day): number {
	return (
		Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000
	);
}

export function addDays(d: Day, n: number): Day {
	const date = new Date((dayNumber(d) + n) * 86_400_000);
	return date.toISOString().slice(0, 10);
}

/** Days from `a` to `b` (positive when b is later). */
export function daysBetween(a: Day, b: Day): number {
	return dayNumber(b) - dayNumber(a);
}

export function monthOfDay(d: Day): Month {
	return `${d.slice(0, 7)}-01`;
}

export function dayIn(m: Month, day: number): Day {
	return `${m.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

export function lastDayOf(m: Month): Day {
	return dayIn(m, daysInMonth(m));
}

/** Inclusive number of days that [start, end] shares with month `m`. */
export function overlapDays(start: Day, end: Day, m: Month): number {
	const from = start > m ? start : m;
	const last = lastDayOf(m);
	const to = end < last ? end : last;
	return to < from ? 0 : daysBetween(from, to) + 1;
}

// ---------------------------------------------------------------------------
// Entry periods

export interface Period {
	start: Day;
	end: Day;
	/** Inclusive length in days. */
	days: number;
}

/**
 * The days an entry dated `date` covers: from the day after the previous entry through
 * `date`. The first entry starts on the 1st of its month.
 */
export function entryPeriod(entries: Entry[], date: Day): Period {
	let prev: Day | null = null;
	for (const e of entries) if (e.date < date && (prev === null || e.date > prev)) prev = e.date;
	const start = prev ? addDays(prev, 1) : monthOfDay(date);
	return { start, end: date, days: daysBetween(start, date) + 1 };
}

export function previousEntry(entries: Entry[], date: Day): Entry | undefined {
	let prev: Entry | undefined;
	for (const e of entries) if (e.date < date && (!prev || e.date > prev.date)) prev = e;
	return prev;
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

export function fullWeekIncome(
	sources: IncomeSource[],
	settings: BudgetSettings,
	m: Month
): number {
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

export function expectedIncome(
	sources: IncomeSource[],
	settings: BudgetSettings,
	m: Month
): number {
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

/** The day a payment lands in month `m`: the 15th for tax, the 1st for everything else. */
export function dueDay(item: CostItem, m: Month): Day {
	return dayIn(m, item.is_tax && item.frequency === 'quarterly' ? 15 : 1);
}

/** Payment due dates for an item that fall within [start, end]. */
export function dueDatesIn(item: CostItem, start: Day, end: Day): Day[] {
	const dates: Day[] = [];
	for (let m = monthOfDay(start); m <= end; m = addMonths(m, 1)) {
		if (!isActive(item, m) || !isPaymentMonth(item, m)) continue;
		const d = dueDay(item, m);
		if (d >= start && d <= end) dates.push(d);
	}
	return dates;
}

/**
 * Per-payment amount for `m`. Variable items use the average of the last three months
 * with an actual payment before `m`, falling back to the set amount.
 */
export function paymentAmount(item: CostItem, entries: Entry[], m: Month): number {
	if (item.is_variable && entries.length > 0) {
		const earliest = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
		const paid: number[] = [];
		for (
			let month = addMonths(m, -1);
			month >= monthOfDay(earliest) && paid.length < 3;
			month = addMonths(month, -1)
		) {
			if (!isPaymentMonth(item, month)) continue;
			const amount = monthActuals(entries, [item], month).costs.get(item.id) ?? 0;
			if (amount > 0) paid.push(amount);
		}
		if (paid.length > 0) return paid.reduce((a, b) => a + b, 0) / paid.length;
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
// Attributing entries to months

export interface MonthActuals {
	/** Days of the month covered by entries. Coverage always starts on the 1st. */
	covered: number;
	income: number;
	/** cost_item_id -> cents attributed to this month */
	costs: Map<number, number>;
	extraIncome: number;
	extraCosts: number;
}

/**
 * The part of each entry that belongs to month `m`. Regular income is spread evenly over
 * the days an entry covers. A cost is placed on the due dates inside the entry's period
 * (rent on the 1st, tax on the 15th), or spread by days if none fall inside it. One-off
 * extras belong to the month of the entry's date.
 */
export function monthActuals(entries: Entry[], costs: CostItem[], m: Month): MonthActuals {
	const out: MonthActuals = {
		covered: 0,
		income: 0,
		costs: new Map(),
		extraIncome: 0,
		extraCosts: 0
	};
	for (const entry of entries) {
		const period = entryPeriod(entries, entry.date);
		const overlap = overlapDays(period.start, period.end, m);
		if (overlap === 0) continue;
		const share = overlap / period.days;
		out.covered += overlap;

		if (monthOfDay(entry.date) === m) {
			for (const x of entry.extras) {
				if (x.kind === 'income') out.extraIncome += x.amount_cents;
				else out.extraCosts += x.amount_cents;
			}
		}

		for (const value of Object.values(entry.income)) out.income += value * share;

		for (const [key, value] of Object.entries(entry.costs)) {
			const id = Number(key);
			const item = costs.find((c) => c.id === id);
			const due = item ? dueDatesIn(item, period.start, period.end) : [];
			const amount = due.length
				? (value * due.filter((d) => monthOfDay(d) === m).length) / due.length
				: value * share;
			if (amount !== 0) out.costs.set(id, (out.costs.get(id) ?? 0) + amount);
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Per-month figures

export interface MonthFigures {
	month: Month;
	/** True when entries cover any of the month. */
	actual: boolean;
	/** Days covered by entries (always from the 1st); equals the month length when complete. */
	coveredDays: number;
	/** Actual income so far plus expected income for the days not yet covered. */
	income: number;
	/** Actual income attributed to the month, or null when nothing is entered. */
	actualIncome: number | null;
	expectedIncome: number;
	/** Sum of payments expected this month (annual and quarterly in their due months). */
	expectedCosts: number;
	/** Actual costs attributed to the month, including extras. */
	actualCosts: number | null;
	/** Smoothed costs used for the spending window. */
	windowCosts: number;
	/** Costs used for the set-aside (quarterly smoothed, annual in full). */
	setAsideCosts: number;
}

export function monthFigures(data: BudgetData, m: Month): MonthFigures {
	const { sources, costs, settings, entries } = data;
	const expIncome = expectedIncome(sources, settings, m);

	let expectedCosts = 0;
	let windowCosts = 0;
	let setAsideCosts = 0;
	for (const item of costs) {
		expectedCosts += costDue(item, entries, m);
		windowCosts += costAccrued(item, entries, m);
		setAsideCosts += costForSetAside(item, entries, m);
	}

	const actuals = monthActuals(entries, costs, m);
	if (actuals.covered === 0) {
		return {
			month: m,
			actual: false,
			coveredDays: 0,
			income: expIncome,
			actualIncome: null,
			expectedIncome: expIncome,
			expectedCosts,
			actualCosts: null,
			windowCosts,
			setAsideCosts
		};
	}

	const total = daysInMonth(m);
	const coveredThrough = dayIn(m, actuals.covered);
	const actualIncome = actuals.income + actuals.extraIncome;
	const actualCosts = [...actuals.costs.values()].reduce((a, b) => a + b, 0) + actuals.extraCosts;

	// Actuals so far, plus expected payments still to come this month. Lumpy payments
	// (quarterly, annual) are swapped for their smoothed amounts so a tax payment inside the
	// window isn't counted on top of the accruals for the months around it.
	let actualWindow = actualCosts;
	let actualSetAside = actualCosts;
	for (const item of costs) {
		const paid = actuals.costs.get(item.id) ?? 0;
		const stillDue = dueDay(item, m) > coveredThrough ? costDue(item, entries, m) : 0;
		if (item.frequency === 'quarterly') {
			actualWindow += costAccrued(item, entries, m) - paid;
			actualSetAside += costForSetAside(item, entries, m) - paid;
		} else if (item.frequency === 'annual') {
			actualWindow += costAccrued(item, entries, m) - paid;
			actualSetAside += stillDue;
		} else {
			actualWindow += stillDue;
			actualSetAside += stillDue;
		}
	}

	return {
		month: m,
		actual: true,
		coveredDays: actuals.covered,
		income: actualIncome + (expIncome * (total - actuals.covered)) / total,
		actualIncome,
		expectedIncome: expIncome,
		expectedCosts,
		actualCosts,
		windowCosts: actualWindow,
		setAsideCosts: actualSetAside
	};
}

// ---------------------------------------------------------------------------
// Expected amounts for an entry's period (prefills the entry form)

/** Expected income per source over [start, end], prorated by days in each month. */
export function expectedIncomeForPeriod(
	sources: IncomeSource[],
	settings: BudgetSettings,
	start: Day,
	end: Day
): Map<number, number> {
	const out = new Map<number, number>();
	for (let m = monthOfDay(start); m <= end; m = addMonths(m, 1)) {
		const share = overlapDays(start, end, m) / daysInMonth(m);
		for (const [id, value] of expectedIncomeBySource(sources, settings, m)) {
			out.set(id, (out.get(id) ?? 0) + value * share);
		}
	}
	return out;
}

/** Payments expected over [start, end]: each due date inside the period counts once. */
export function expectedCostForPeriod(
	item: CostItem,
	entries: Entry[],
	start: Day,
	end: Day
): number {
	return dueDatesIn(item, start, end).reduce(
		(sum, d) => sum + paymentAmount(item, entries, monthOfDay(d)),
		0
	);
}

// ---------------------------------------------------------------------------
// 6.3 / 6.5 Annual projection and the spending window

/** The last 6 entered months plus following months to make 12. */
export function projectionWindow(entries: Entry[], today: Date): Month[] {
	if (entries.length === 0) return monthRange(monthOf(today), 12);
	const months = entries.map((e) => monthOfDay(e.date)).sort();
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
export function setAside(
	figures: MonthFigures,
	perMonth: number,
	settings: BudgetSettings
): number {
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
	date: Day;
	period: Period;
	income: number;
	costs: number;
	/** Change across accounts with a balance on both this entry and the previous one. */
	actualChange: number;
	/** Entered discretionary spending, if any. */
	spent: number | null;
	/** Only when spending was entered: actual change minus expected change. */
	unaccounted: number | null;
	/** Only when spending was left blank: income − costs − actual change. */
	implied: number | null;
}

/** Compare an entry with the balances on the previous entry. */
export function reconcile(data: BudgetData, date: Day): Reconciliation | null {
	const entry = data.entries.find((e) => e.date === date);
	const prev = previousEntry(data.entries, date);
	if (!entry || !prev) return null;

	let actualChange = 0;
	let compared = 0;
	for (const account of data.accounts) {
		if (account.archived) continue;
		const now = data.snapshots.find((s) => s.account_id === account.id && s.as_of === date);
		const before = data.snapshots.find((s) => s.account_id === account.id && s.as_of === prev.date);
		if (!now || !before) continue;
		actualChange += now.balance_cents - before.balance_cents;
		compared++;
	}
	if (compared === 0) return null;

	const income = entryIncome(entry);
	const costs = entryCosts(entry);
	const spent = entry.discretionary_spent_cents;
	return {
		date,
		period: entryPeriod(data.entries, date),
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
	date: Day;
	period: Period;
	spent: number;
	source: 'entered' | 'implied';
	/** What the spending window allowed for the period: perDay × days. */
	allowed: number;
	/** allowed − spent: positive means under the window. */
	difference: number;
}

/** Spending since the previous entry, compared with the daily window over those days. */
export function spendingFor(data: BudgetData, date: Day, perDay: number): SpendingResult | null {
	const entry = data.entries.find((e) => e.date === date);
	if (!entry) return null;
	const period = entryPeriod(data.entries, date);
	const allowed = perDay * period.days;

	let spent: number;
	let source: SpendingResult['source'];
	if (entry.discretionary_spent_cents !== null) {
		spent = entry.discretionary_spent_cents;
		source = 'entered';
	} else {
		const rec = reconcile(data, date);
		if (rec?.implied == null) return null;
		spent = rec.implied;
		source = 'implied';
	}
	return { date, period, spent, source, allowed, difference: allowed - spent };
}

/**
 * Average monthly difference from the window over entries in the `days` up to `date`
 * (about six months by default), weighted by how many days each entry covers.
 */
export function averageSpendingDifference(
	data: BudgetData,
	date: Day,
	perDay: number,
	days = 183
): { perMonth: number; entries: number } | null {
	const from = addDays(date, -days);
	const results = data.entries
		.filter((e) => e.date > from && e.date <= date)
		.map((e) => spendingFor(data, e.date, perDay))
		.filter((r): r is SpendingResult => r !== null);
	if (results.length === 0) return null;
	const difference = results.reduce((sum, r) => sum + r.difference, 0);
	const covered = results.reduce((sum, r) => sum + r.period.days, 0);
	return { perMonth: (difference / covered) * (365 / 12), entries: results.length };
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
	onOrBefore?: Day
): Snapshot | undefined {
	let best: Snapshot | undefined;
	for (const s of snapshots) {
		if (s.account_id !== accountId) continue;
		if (onOrBefore && s.as_of > onOrBefore) continue;
		if (!best || s.as_of > best.as_of) best = s;
	}
	return best;
}

export interface AccountBalance {
	account: Account;
	balance: number | null;
	asOf: Day | null;
	/** Change since the account's previous balance, when there is one. */
	change: number | null;
}

export function accountBalances(accounts: Account[], snapshots: Snapshot[]): AccountBalance[] {
	return accounts
		.filter((a) => !a.archived)
		.map((account) => {
			const latest = latestSnapshot(snapshots, account.id);
			if (!latest) return { account, balance: null, asOf: null, change: null };
			const prev = latestSnapshot(snapshots, account.id, addDays(latest.as_of, -1));
			return {
				account,
				balance: latest.balance_cents,
				asOf: latest.as_of,
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
