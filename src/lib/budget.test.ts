import { describe, expect, it } from 'vitest';
import {
	addMonths,
	costDue,
	expectedIncome,
	expectedIncomeBySource,
	fullWeekIncome,
	monthFigures,
	projection,
	reconcile,
	reducedWeekIncome,
	setAside,
	spendingFor,
	taxStatus,
	type BudgetData,
	type CostItem,
	type Entry,
	type IncomeSource
} from './budget';

// Fixture lives only here — it is never written to the database.

const START = '2020-01-01';
const TODAY = new Date(2026, 9, 27); // Oct 27 2026

let nextId = 1;
function source(
	name: string,
	category: IncomeSource['category'],
	frequency: IncomeSource['frequency'],
	rate: number,
	quantity: number,
	summer_quantity = 0,
	extra: Partial<IncomeSource> = {}
): IncomeSource {
	return {
		id: nextId++,
		name,
		category,
		frequency,
		start_month: START,
		end_month: null,
		rates: [{ effective_from: START, rate_cents: rate * 100, quantity, summer_quantity }],
		...extra
	};
}

function cost(
	name: string,
	frequency: CostItem['frequency'],
	amount: number,
	extra: Partial<CostItem> = {}
): CostItem {
	return {
		id: nextId++,
		name,
		frequency,
		due_month: null,
		is_tax: false,
		is_variable: false,
		start_month: START,
		end_month: null,
		amounts: [{ effective_from: extra.start_month ?? START, amount_cents: amount * 100 }],
		...extra
	};
}

function fixture(): BudgetData {
	nextId = 1; // sources 1–7, tax 8, rent 9, bills 10
	return {
		sources: [
			source('Weekly students', 'tutoring', 'weekly', 90, 26),
			source('Biweekly student', 'tutoring', 'biweekly', 200, 1),
			source('Small group', 'tutoring', 'weekly', 75, 1),
			source('Dog A', 'dog_walking', 'weekly', 175, 1, 1),
			source('Dog B', 'dog_walking', 'weekly', 100, 1, 1),
			source('Dog C', 'dog_walking', 'weekly', 40, 1, 1),
			source('Dog D', 'dog_walking', 'weekly', 60, 1, 1)
		],
		costs: [
			cost('Estimated tax', 'quarterly', 6000, { is_tax: true }),
			cost('Rent', 'monthly', 1500),
			cost('Bills', 'monthly', 1750)
		],
		settings: {
			tutoring_cancellations_per_week: 1.5,
			dog_cancellations_per_week: 1,
			summer_tutoring_hours_per_week: 6.5,
			summer_tutoring_rate_cents: 9000,
			monthly_savings_goal_cents: 0,
			reduced_weeks_by_month: {
				'01': 1,
				'02': 0,
				'03': 1,
				'04': 0,
				'05': 0,
				'06': 2.5,
				'07': 4.4,
				'08': 2.5,
				'09': 0,
				'10': 0,
				'11': 1,
				'12': 2
			}
		},
		entries: [],
		accounts: [],
		snapshots: []
	};
}

function entry(month: string, partial: Partial<Entry> = {}): Entry {
	return { month, discretionary_spent_cents: null, income: {}, costs: {}, extras: [], ...partial };
}

const dollars = (cents: number) => cents / 100;

describe('weekly income (6.1)', () => {
	const data = fixture();

	it('full-schedule week is about $2,660', () => {
		expect(
			Math.abs(dollars(fullWeekIncome(data.sources, data.settings, '2026-10-01')) - 2660)
		).toBeLessThanOrEqual(15);
	});

	it('reduced week is about $866', () => {
		expect(
			Math.abs(dollars(reducedWeekIncome(data.sources, data.settings, '2026-07-01')) - 866)
		).toBeLessThanOrEqual(15);
	});

	it('converts biweekly and monthly frequencies', () => {
		const settings = {
			...fixture().settings,
			tutoring_cancellations_per_week: 0,
			dog_cancellations_per_week: 0
		};
		const m = '2026-10-01';
		expect(fullWeekIncome([source('B', 'other', 'biweekly', 200, 1)], settings, m)).toBeCloseTo(
			10000
		);
		expect(fullWeekIncome([source('M', 'other', 'monthly', 522, 1)], settings, m)).toBeCloseTo(
			(52200 * 12) / 52.18
		);
		expect(fullWeekIncome([source('W', 'other', 'weekly', 50, 3)], settings, m)).toBeCloseTo(15000);
	});

	it('summer_quantity 0 removes a non-tutoring source in reduced weeks', () => {
		const settings = {
			...fixture().settings,
			summer_tutoring_hours_per_week: 0,
			dog_cancellations_per_week: 0
		};
		const stays = source('Stays', 'dog_walking', 'weekly', 100, 1, 1);
		const stops = source('Stops', 'dog_walking', 'weekly', 100, 1, 0);
		expect(reducedWeekIncome([stays, stops], settings, '2026-07-01')).toBe(10000);
		expect(fullWeekIncome([stays, stops], settings, '2026-07-01')).toBe(20000);
	});

	it('an ended income source stops contributing after its end month', () => {
		const data = fixture();
		data.sources[3].end_month = '2026-10-01'; // Dog A, $175/week
		const oct = expectedIncome(data.sources, data.settings, '2026-10-01');
		const nov = expectedIncome(data.sources, data.settings, '2026-11-01');
		const withA = fixture();
		expect(oct).toBeCloseTo(expectedIncome(withA.sources, withA.settings, '2026-10-01'));
		expect(nov).toBeLessThan(
			expectedIncome(withA.sources, withA.settings, '2026-11-01') - 17500 * 3
		);
	});
});

describe('per-source expected income', () => {
	it('adds up to the monthly expected income', () => {
		const data = fixture();
		for (const m of ['2026-07-01', '2026-10-01', '2026-12-01']) {
			const bySource = expectedIncomeBySource(data.sources, data.settings, m);
			const total = [...bySource.values()].reduce((a, b) => a + b, 0);
			expect(total).toBeCloseTo(expectedIncome(data.sources, data.settings, m), 0);
		}
	});
});

describe('annual projection and spending window (6.3, 6.5)', () => {
	it('projects about $111,000 a year with no actuals', () => {
		const p = projection(fixture(), TODAY);
		expect(p.months).toHaveLength(12);
		expect(Math.abs(dollars(p.annualIncome) - 111000)).toBeLessThanOrEqual(3000);
	});

	it('perMonth with no savings goal is between $3,700 and $4,400', () => {
		const p = projection(fixture(), TODAY);
		expect(dollars(p.perMonth)).toBeGreaterThanOrEqual(3700);
		expect(dollars(p.perMonth)).toBeLessThanOrEqual(4400);
		expect(p.perWeek).toBeCloseTo(p.annualDiscretionary / 52.18);
		expect(p.perDay).toBeCloseTo(p.annualDiscretionary / 365);
	});

	it('uses the last 6 entered months plus expected months', () => {
		const data = fixture();
		data.entries = monthsFrom('2026-01-01', 9).map((m) => entry(m, { income: { 1: 500000 } }));
		const p = projection(data, TODAY);
		expect(p.months[0].month).toBe('2026-04-01');
		expect(p.months.filter((f) => f.actual)).toHaveLength(6);
		expect(p.months[0].income).toBe(500000);
	});

	it('subtracts the savings goal', () => {
		const data = fixture();
		const without = projection(data, TODAY).perMonth;
		data.settings.monthly_savings_goal_cents = 50000;
		expect(projection(data, TODAY).perMonth).toBeCloseTo(without - 50000);
	});
});

describe('seasonal set-aside (6.6)', () => {
	it('July draws from the reserve and October adds to it', () => {
		const data = fixture();
		const { perMonth } = projection(data, TODAY);
		expect(setAside(monthFigures(data, '2027-07-01'), perMonth, data.settings)).toBeLessThan(0);
		expect(setAside(monthFigures(data, '2026-10-01'), perMonth, data.settings)).toBeGreaterThan(0);
	});
});

describe('costs (6.4)', () => {
	it('a rent change applies from its month only', () => {
		const data = fixture();
		const before = monthFigures(data, '2026-12-01').windowCosts;
		const earlier = monthFigures(data, '2026-11-01').windowCosts;
		data.costs[1].amounts.push({ effective_from: '2027-01-01', amount_cents: 165000 });

		expect(monthFigures(data, '2026-11-01').windowCosts).toBe(earlier);
		expect(monthFigures(data, '2026-12-01').windowCosts).toBe(before);
		expect(monthFigures(data, '2027-01-01').windowCosts).toBe(before + 15000);
		expect(monthFigures(data, '2027-06-01').windowCosts).toBe(before + 15000);
	});

	it('a $1,200 annual expense adds $100/month to the window and lands in full in its due month', () => {
		const data = fixture();
		const base = projection(data, TODAY);
		const baseMarch = monthFigures(data, '2027-03-01');
		const baseApril = monthFigures(data, '2027-04-01');

		data.costs.push(cost('Car insurance', 'annual', 1200, { due_month: 3 }));
		const withAnnual = projection(data, TODAY);
		expect(withAnnual.annualCosts - base.annualCosts).toBeCloseTo(120000);
		expect(withAnnual.perMonth - base.perMonth).toBeCloseTo(-10000);

		const march = monthFigures(data, '2027-03-01');
		const april = monthFigures(data, '2027-04-01');
		expect(march.windowCosts - baseMarch.windowCosts).toBeCloseTo(10000);
		expect(march.setAsideCosts - baseMarch.setAsideCosts).toBeCloseTo(120000);
		expect(april.setAsideCosts).toBeCloseTo(baseApril.setAsideCosts);
	});

	it('a one-time expense affects only its own month', () => {
		const data = fixture();
		const base = (m: string) => monthFigures(fixture(), m).windowCosts;
		data.costs.push(cost('Laptop', 'one_time', 900, { start_month: '2026-11-01' }));
		expect(monthFigures(data, '2026-10-01').windowCosts).toBe(base('2026-10-01'));
		expect(monthFigures(data, '2026-11-01').windowCosts).toBe(base('2026-11-01') + 90000);
		expect(monthFigures(data, '2026-12-01').windowCosts).toBe(base('2026-12-01'));
	});

	it('a monthly_extras cost affects only its own month', () => {
		const data = fixture();
		data.entries = [
			entry('2026-08-01', { costs: { 9: 150000, 10: 175000 } }),
			entry('2026-09-01', {
				costs: { 9: 150000, 10: 175000 },
				extras: [{ kind: 'cost', name: 'Vet bill', amount_cents: 40000 }]
			}),
			entry('2026-10-01', { costs: { 9: 150000, 10: 175000 } })
		];
		const [aug, sep, oct] = ['2026-08-01', '2026-09-01', '2026-10-01'].map(
			(m) => monthFigures(data, m).actualCosts
		);
		expect(sep! - aug!).toBe(40000);
		expect(oct).toBe(aug);
	});

	it('variable items use the average of the last 3 actuals', () => {
		const data = fixture();
		const utilities = cost('Utilities', 'monthly', 100, { is_variable: true });
		data.costs.push(utilities);
		expect(costDue(utilities, data.entries, '2026-10-01')).toBe(10000);
		data.entries = [
			entry('2026-06-01', { costs: { [utilities.id]: 50000 } }),
			entry('2026-07-01', { costs: { [utilities.id]: 9000 } }),
			entry('2026-08-01', { costs: { [utilities.id]: 12000 } }),
			entry('2026-09-01', { costs: { [utilities.id]: 15000 } })
		];
		expect(costDue(utilities, data.entries, '2026-10-01')).toBe(12000);
	});

	it('quarterly tax is due in Jan, Apr, Jun and Sep', () => {
		const tax = fixture().costs[0];
		const due = monthsFrom('2026-01-01', 12).filter((m) => costDue(tax, [], m) > 0);
		expect(due).toEqual(['2026-01-01', '2026-04-01', '2026-06-01', '2026-09-01']);
	});
});

describe('reconciliation (6.9) and spending (6.7)', () => {
	function twoMonths(spent: number | null): BudgetData {
		const data = fixture();
		data.accounts = [
			{
				id: 100,
				name: 'Checking',
				type: 'checking',
				counts_toward_spending: true,
				archived: false
			},
			{
				id: 101,
				name: 'Tax reserve',
				type: 'tax_reserve',
				counts_toward_spending: false,
				archived: false
			},
			{ id: 102, name: 'Card', type: 'credit_card', counts_toward_spending: true, archived: false }
		];
		data.snapshots = [
			{ account_id: 100, month: '2026-08-01', balance_cents: 500000 },
			{ account_id: 101, month: '2026-08-01', balance_cents: 200000 },
			{ account_id: 102, month: '2026-08-01', balance_cents: -30000 },
			{ account_id: 100, month: '2026-09-01', balance_cents: 520000 },
			{ account_id: 101, month: '2026-09-01', balance_cents: 400000 },
			{ account_id: 102, month: '2026-09-01', balance_cents: -60000 }
		];
		// Balances changed by +20,000 + 200,000 − 30,000 = +190,000 cents ($1,900).
		data.entries = [
			entry('2026-09-01', {
				discretionary_spent_cents: spent,
				income: { 1: 1000000 }, // $10,000
				costs: { 9: 150000, 10: 175000 }, // $3,250
				extras: [{ kind: 'income', name: 'Workshop', amount_cents: 50000 }] // $500
			})
		];
		return data;
	}

	it('implies spending from balance changes when spending is blank', () => {
		const rec = reconcile(twoMonths(null), '2026-09-01')!;
		expect(rec.actualChange).toBe(190000);
		// 10,500 − 3,250 − 1,900 = 5,350
		expect(rec.implied).toBe(535000);
		expect(rec.unaccounted).toBeNull();
	});

	it('reports unaccounted money when spending was entered', () => {
		const rec = reconcile(twoMonths(500000), '2026-09-01')!;
		// expected change 10,500 − 3,250 − 5,000 = 2,250; actual 1,900
		expect(rec.unaccounted).toBe(-35000);
		expect(rec.implied).toBeNull();
	});

	it('compares entered or implied spending with the window', () => {
		expect(spendingFor(twoMonths(null), '2026-09-01', 400000)).toMatchObject({
			source: 'implied',
			spent: 535000,
			difference: -135000
		});
		expect(spendingFor(twoMonths(300000), '2026-09-01', 400000)).toMatchObject({
			source: 'entered',
			difference: 100000
		});
	});

	it('returns nothing without balances for the previous month', () => {
		const data = twoMonths(null);
		data.snapshots = data.snapshots.filter((s) => s.month === '2026-09-01');
		expect(reconcile(data, '2026-09-01')).toBeNull();
	});
});

describe('tax reserve (6.8)', () => {
	it('accrues a third of the quarterly payment per month since the last due date', () => {
		const data = fixture();
		data.accounts = [
			{ id: 1, name: 'Tax', type: 'tax_reserve', counts_toward_spending: false, archived: false }
		];
		data.snapshots = [{ account_id: 1, month: '2026-09-01', balance_cents: 100000 }];

		const status = taxStatus(data, TODAY); // last due Sep 15, one month accrued
		expect(status.nextDue).toEqual(new Date(2027, 0, 15));
		expect(status.monthsAccrued).toBe(1);
		expect(status.needed).toBeCloseTo(200000);
		expect(status.shortBy).toBeCloseTo(100000);
		expect(status.onTrack).toBe(false);

		data.snapshots.push({ account_id: 1, month: '2026-10-01', balance_cents: 250000 });
		expect(taxStatus(data, TODAY).onTrack).toBe(true);
	});
});

function monthsFrom(start: string, count: number): string[] {
	return Array.from({ length: count }, (_, i) => addMonths(start, i));
}
