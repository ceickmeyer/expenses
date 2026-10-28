import { describe, expect, it } from 'vitest';
import {
	accountBalances,
	balanceSeries,
	billMonthly,
	billsPerMonth,
	DAYS_PER_MONTH,
	periods,
	summary,
	taxStatus,
	type Account,
	type Bill,
	type BudgetData,
	type Checkin
} from './budget';

const TODAY = new Date(2026, 9, 27); // Oct 27 2026

const account = (id: number, type: Account['type'], counts = true, archived = false): Account => ({
	id,
	name: `Account ${id}`,
	type,
	counts_toward_spending: counts,
	archived
});

const bill = (
	id: number,
	amount: number,
	frequency: Bill['frequency'],
	extra: Partial<Bill> = {}
): Bill => ({
	id,
	name: `Bill ${id}`,
	amount_cents: amount * 100,
	frequency,
	is_tax: false,
	archived: false,
	...extra
});

/** Amounts in dollars for readability. */
const checkin = (date: string, main: number, balances: Record<number, number>): Checkin => ({
	date,
	main_income_cents: main * 100,
	balances: Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, v * 100]))
});

/** Checking (1), savings (2), tax reserve (3, excluded), investments (4, excluded). */
function fixture(): BudgetData {
	return {
		accounts: [
			account(1, 'checking'),
			account(2, 'savings'),
			account(3, 'tax_reserve', false),
			account(4, 'investment', false)
		],
		bills: [
			bill(1, 1500, 'monthly'), // rent
			bill(2, 6000, 'quarterly', { is_tax: true }), // $2,000 a month
			bill(3, 1200, 'annual') // $100 a month
		],
		checkins: [],
		settings: { monthly_savings_goal_cents: 0 }
	};
}

describe('bills', () => {
	it('converts each frequency to a monthly amount', () => {
		const [rent, tax, insurance] = fixture().bills;
		expect(billMonthly(rent)).toBe(150000);
		expect(billMonthly(tax)).toBeCloseTo(200000);
		expect(billMonthly(insurance)).toBeCloseTo(10000);
	});

	it('leaves archived bills out of the total', () => {
		const data = fixture();
		data.bills[2].archived = true;
		expect(billsPerMonth(data.bills)).toBeCloseTo(350000);
	});
});

describe('periods between check-ins', () => {
	it('works out everything else from growth, main pay and bills', () => {
		const data = fixture();
		data.checkins = [
			checkin('2026-09-27', 0, { 1: 4000, 2: 10000, 3: 2000, 4: 50000 }),
			checkin('2026-10-27', 4200, { 1: 4500, 2: 11000, 3: 4000, 4: 53000 })
		];
		const [p] = periods(data);
		expect(p.days).toBe(30);
		// Checking +500 and savings +1,000. Tax reserve and investments don't count.
		expect(p.growth).toBe(150000);
		expect(p.mainIncome).toBe(420000);
		expect(p.bills).toBeCloseTo((360000 * 30) / DAYS_PER_MONTH);
		expect(p.other).toBeCloseTo(150000 - 420000 + p.bills);
	});

	it('treats a skipped account as unchanged', () => {
		const data = fixture();
		data.checkins = [
			checkin('2026-08-27', 0, { 1: 4000, 2: 10000 }),
			checkin('2026-09-27', 0, { 1: 4500 }), // savings not updated
			checkin('2026-10-27', 0, { 1: 4500, 2: 10600 })
		];
		const [first, second] = periods(data);
		expect(first.growth).toBe(50000);
		expect(second.growth).toBe(60000);
	});

	it('does not count a newly added account’s first balance as growth', () => {
		const data = fixture();
		data.checkins = [
			checkin('2026-09-27', 0, { 1: 4000 }),
			checkin('2026-10-27', 0, { 1: 4200, 2: 10000 })
		];
		expect(periods(data)[0].growth).toBe(20000);
	});

	it('ignores archived accounts', () => {
		const data = fixture();
		data.accounts[1].archived = true;
		data.checkins = [
			checkin('2026-09-27', 0, { 1: 4000, 2: 10000 }),
			checkin('2026-10-27', 0, { 1: 4200, 2: 20000 })
		];
		expect(periods(data)[0].growth).toBe(20000);
	});

	it('sorts check-ins by date regardless of input order', () => {
		const data = fixture();
		data.checkins = [checkin('2026-10-27', 0, { 1: 5000 }), checkin('2026-09-27', 0, { 1: 4000 })];
		expect(periods(data)[0]).toMatchObject({
			start: '2026-09-27',
			end: '2026-10-27',
			growth: 100000
		});
	});
});

describe('summary', () => {
	it('needs at least two check-ins', () => {
		const data = fixture();
		expect(summary(data)).toBeNull();
		data.checkins = [checkin('2026-10-27', 0, { 1: 4000 })];
		expect(summary(data)).toBeNull();
	});

	it('averages the last ~90 days, weighted by days, and subtracts the savings goal', () => {
		const data = fixture();
		data.settings.monthly_savings_goal_cents = 50000;
		data.checkins = [
			checkin('2026-01-01', 0, { 1: 1000 }),
			checkin('2026-06-01', 0, { 1: 100000 }), // old and huge: outside the window
			checkin('2026-07-27', 0, { 1: 100000 }),
			checkin('2026-08-27', 4000, { 1: 101000 }),
			checkin('2026-09-27', 4000, { 1: 102000 }),
			checkin('2026-10-27', 4000, { 1: 103500 })
		];
		const s = summary(data)!;
		expect(s.periods.map((p) => p.end)).toEqual(['2026-08-27', '2026-09-27', '2026-10-27']);
		expect(s.days).toBe(92);
		const growthPerMonth = (350000 / 92) * DAYS_PER_MONTH;
		expect(s.perMonth.growth).toBeCloseTo(growthPerMonth);
		expect(s.perMonth.mainIncome).toBeCloseTo((1200000 / 92) * DAYS_PER_MONTH);
		expect(s.spare).toBeCloseTo(growthPerMonth - 50000);
		expect(s.perDay).toBeCloseTo((growthPerMonth - 50000) / DAYS_PER_MONTH);
	});

	it('uses the latest period even when it alone is longer than the window', () => {
		const data = fixture();
		data.checkins = [checkin('2026-01-01', 0, { 1: 1000 }), checkin('2026-10-27', 0, { 1: 2000 })];
		expect(summary(data)!.periods).toHaveLength(1);
	});

	it('goes negative when growth is below the savings goal', () => {
		const data = fixture();
		data.settings.monthly_savings_goal_cents = 100000;
		data.checkins = [checkin('2026-09-27', 0, { 1: 4000 }), checkin('2026-10-27', 0, { 1: 4100 })];
		expect(summary(data)!.perDay).toBeLessThan(0);
	});
});

describe('balances', () => {
	it('reports each account’s latest balance and change since its previous one', () => {
		const data = fixture();
		data.checkins = [
			checkin('2026-08-27', 0, { 1: 4000, 2: 10000 }),
			checkin('2026-09-27', 0, { 1: 4500 }),
			checkin('2026-10-27', 0, { 1: 4300, 2: 10600 })
		];
		const [checking, savings, tax] = accountBalances(data);
		expect(checking).toMatchObject({ balance: 430000, asOf: '2026-10-27', change: -20000 });
		expect(savings).toMatchObject({ balance: 1060000, change: 60000 });
		expect(tax).toMatchObject({ balance: null, change: null });
	});

	it('builds chart series per account plus a combined total, carrying skipped accounts forward', () => {
		const data = fixture();
		data.checkins = [
			checkin('2026-08-27', 0, { 1: 4000 }),
			checkin('2026-09-27', 0, { 1: 4500, 2: 10000 }),
			checkin('2026-10-27', 0, { 1: 4300 })
		];
		const { dates, series } = balanceSeries(data);
		expect(dates).toEqual(['2026-08-27', '2026-09-27', '2026-10-27']);
		expect(series.map((s) => s.id)).toEqual(['total', 1, 2]);
		expect(series[2].values).toEqual([null, 1000000, 1000000]);
		expect(series[0].values).toEqual([400000, 1450000, 1430000]);
	});
});

describe('tax reserve', () => {
	it('accrues a third of the quarterly tax per month since the last due date', () => {
		const data = fixture();
		data.checkins = [checkin('2026-10-20', 0, { 3: 1000 })];

		const status = taxStatus(data, TODAY); // last due Sep 15, one month accrued
		expect(status.nextDue).toEqual(new Date(2027, 0, 15));
		expect(status.nextPayment).toBe(600000);
		expect(status.monthsAccrued).toBe(1);
		expect(status.needed).toBeCloseTo(200000);
		expect(status.shortBy).toBeCloseTo(100000);
		expect(status.onTrack).toBe(false);

		data.checkins.push(checkin('2026-10-27', 0, { 3: 2500 }));
		expect(taxStatus(data, TODAY).onTrack).toBe(true);
	});
});
