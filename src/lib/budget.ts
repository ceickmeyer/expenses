// Budget engine: pure functions from plain data to numbers. No Supabase, no Svelte.
// All money is in cents.
//
// The model: every so often you check in with each account's balance and the main-job pay
// you received since the last check-in. Bills are a fixed list. Between two check-ins:
//
//   growth          = change in balances (accounts that count toward growth)
//   bills           = monthly bill total, prorated by days
//   everything else = growth − main pay + bills   (side income minus day-to-day spending)
//
// The headline is the spare room: average monthly growth minus the savings goal, per day.

export type Day = string; // 'YYYY-MM-DD'

export type AccountType =
	'checking' | 'savings' | 'tax_reserve' | 'investment' | 'credit_card' | 'other';
export type BillFrequency = 'monthly' | 'quarterly' | 'annual';

export interface Account {
	id: number;
	name: string;
	type: AccountType;
	/** Included in growth. Off for accounts that move on their own, like investments. */
	counts_toward_spending: boolean;
	archived: boolean;
}

export interface Bill {
	id: number;
	name: string;
	amount_cents: number;
	frequency: BillFrequency;
	is_tax: boolean;
	archived: boolean;
}

export interface Checkin {
	date: Day;
	/** Main-job pay received since the previous check-in. */
	main_income_cents: number;
	/** account_id -> balance on this date. Accounts left out are treated as unchanged. */
	balances: Record<number, number>;
}

export interface BudgetData {
	accounts: Account[];
	bills: Bill[];
	checkins: Checkin[];
	settings: { monthly_savings_goal_cents: number };
}

export const DAYS_PER_MONTH = 365.25 / 12;

/** About three months of check-ins feed the averages. */
export const AVERAGE_OVER_DAYS = 90;

const PER_MONTH: Record<BillFrequency, number> = { monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };

export const TAX_DUE_DATES: [month: number, day: number][] = [
	[1, 15],
	[4, 15],
	[6, 15],
	[9, 15]
];

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

/** Days from `a` to `b` (positive when b is later). */
export function daysBetween(a: Day, b: Day): number {
	return dayNumber(b) - dayNumber(a);
}

export function addDays(d: Day, n: number): Day {
	return new Date((dayNumber(d) + n) * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Bills

export function billMonthly(bill: Bill): number {
	return bill.amount_cents * PER_MONTH[bill.frequency];
}

export function billsPerMonth(bills: Bill[]): number {
	return bills.filter((b) => !b.archived).reduce((sum, b) => sum + billMonthly(b), 0);
}

// ---------------------------------------------------------------------------
// Balances

export function sortedCheckins(checkins: Checkin[]): Checkin[] {
	return [...checkins].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Each account's balance at every check-in, carrying the last known balance forward when an
 * account was skipped. `null` until an account's first balance.
 */
export function balanceTable(
	accounts: Account[],
	checkins: Checkin[]
): Map<number, (number | null)[]> {
	const sorted = sortedCheckins(checkins);
	const table = new Map<number, (number | null)[]>();
	for (const account of accounts) {
		let last: number | null = null;
		table.set(
			account.id,
			sorted.map((c) => {
				if (account.id in c.balances) last = c.balances[account.id];
				return last;
			})
		);
	}
	return table;
}

export function countsTowardGrowth(account: Account): boolean {
	return account.counts_toward_spending && !account.archived;
}

// ---------------------------------------------------------------------------
// Periods between check-ins

export interface Period {
	start: Day;
	end: Day;
	days: number;
	/** Change in balances across accounts that count toward growth. */
	growth: number;
	mainIncome: number;
	/** Bills for these days, from the monthly bill total. */
	bills: number;
	/** growth − main pay + bills: side income minus day-to-day spending. */
	other: number;
}

export function periods(data: BudgetData): Period[] {
	const sorted = sortedCheckins(data.checkins);
	const table = balanceTable(data.accounts, sorted);
	const monthlyBills = billsPerMonth(data.bills);
	const included = data.accounts.filter(countsTowardGrowth);

	const out: Period[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const cur = sorted[i];
		const days = daysBetween(prev.date, cur.date);
		let growth = 0;
		for (const account of included) {
			const before = table.get(account.id)![i - 1];
			const after = table.get(account.id)![i];
			// An account's first balance isn't growth; it just wasn't tracked before.
			if (before !== null && after !== null) growth += after - before;
		}
		const bills = (monthlyBills * days) / DAYS_PER_MONTH;
		out.push({
			start: prev.date,
			end: cur.date,
			days,
			growth,
			mainIncome: cur.main_income_cents,
			bills,
			other: growth - cur.main_income_cents + bills
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// The headline

export interface Summary {
	/** The periods averaged, newest last. */
	periods: Period[];
	days: number;
	/** Monthly averages, weighted by days. */
	perMonth: { growth: number; mainIncome: number; bills: number; other: number };
	savingsGoal: number;
	/** Average monthly growth minus the savings goal. */
	spare: number;
	/** `spare` per day: extra room to spend (or cut back, when negative). */
	perDay: number;
	perWeek: number;
}

/** Averages over the most recent periods covering about `AVERAGE_OVER_DAYS` days. */
export function summary(data: BudgetData, overDays = AVERAGE_OVER_DAYS): Summary | null {
	const all = periods(data);
	if (all.length === 0) return null;

	const used: Period[] = [];
	let days = 0;
	for (let i = all.length - 1; i >= 0 && (days < overDays || used.length === 0); i--) {
		used.unshift(all[i]);
		days += all[i].days;
	}
	if (days === 0) return null;

	const monthly = (pick: (p: Period) => number) =>
		(used.reduce((sum, p) => sum + pick(p), 0) / days) * DAYS_PER_MONTH;
	const perMonth = {
		growth: monthly((p) => p.growth),
		mainIncome: monthly((p) => p.mainIncome),
		bills: monthly((p) => p.bills),
		other: monthly((p) => p.other)
	};
	const savingsGoal = data.settings.monthly_savings_goal_cents;
	const spare = perMonth.growth - savingsGoal;
	return {
		periods: used,
		days,
		perMonth,
		savingsGoal,
		spare,
		perDay: spare / DAYS_PER_MONTH,
		perWeek: (spare / DAYS_PER_MONTH) * 7
	};
}

// ---------------------------------------------------------------------------
// Latest balances

export interface AccountBalance {
	account: Account;
	balance: number | null;
	asOf: Day | null;
	/** Change since this account's previous balance. */
	change: number | null;
}

export function accountBalances(data: BudgetData): AccountBalance[] {
	const sorted = sortedCheckins(data.checkins);
	return data.accounts
		.filter((a) => !a.archived)
		.map((account) => {
			const entered = sorted.filter((c) => account.id in c.balances);
			const latest = entered.at(-1);
			const prev = entered.at(-2);
			if (!latest) return { account, balance: null, asOf: null, change: null };
			const balance = latest.balances[account.id];
			return {
				account,
				balance,
				asOf: latest.date,
				change: prev ? balance - prev.balances[account.id] : null
			};
		});
}

// ---------------------------------------------------------------------------
// Chart series

export interface Series {
	id: number | 'total';
	name: string;
	/** One value per check-in; null before an account's first balance. */
	values: (number | null)[];
}

/** One series per active account, plus the combined total of all of them. */
export function balanceSeries(data: BudgetData): { dates: Day[]; series: Series[] } {
	const sorted = sortedCheckins(data.checkins);
	const accounts = data.accounts.filter((a) => !a.archived);
	const table = balanceTable(accounts, sorted);
	const series: Series[] = accounts
		.map((a) => ({ id: a.id, name: a.name, values: table.get(a.id)! }))
		.filter((s) => s.values.some((v) => v !== null));
	const total: Series = {
		id: 'total',
		name: 'All accounts',
		values: sorted.map((_, i) => {
			const known = series.map((s) => s.values[i]).filter((v): v is number => v !== null);
			return known.length ? known.reduce((a, b) => a + b, 0) : null;
		})
	};
	return { dates: sorted.map((c) => c.date), series: [total, ...series] };
}

// ---------------------------------------------------------------------------
// Tax reserve

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
	/** Next quarterly payment: the active quarterly tax bills. */
	nextPayment: number;
	/** Months since the last due date × a third of the quarterly payment. */
	needed: number;
	/** Latest balance across tax reserve accounts, or null when none has a balance. */
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

	const nextPayment = data.bills
		.filter((b) => b.is_tax && b.frequency === 'quarterly' && !b.archived)
		.reduce((sum, b) => sum + b.amount_cents, 0);
	const needed = (monthsAccrued * nextPayment) / 3;

	let balance: number | null = null;
	for (const b of accountBalances(data)) {
		if (b.account.type === 'tax_reserve' && b.balance !== null) {
			balance = (balance ?? 0) + b.balance;
		}
	}

	const shortBy = needed - (balance ?? 0);
	return {
		lastDue: last,
		nextDue: next,
		monthsAccrued,
		nextPayment,
		needed,
		balance,
		shortBy,
		onTrack: shortBy <= 0
	};
}
