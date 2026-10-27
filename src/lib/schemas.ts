// Zod schemas for every form action. FormData arrives as strings; these coerce and validate.

import { z } from 'zod';
import { parseMoney } from './money';

export const money = z.string().transform((value, ctx) => {
	const cents = parseMoney(value);
	if (cents === null || Number.isNaN(cents)) {
		ctx.addIssue({ code: 'custom', message: 'Enter an amount, like 1,500' });
		return z.NEVER;
	}
	return cents;
});

export const optionalMoney = z
	.string()
	.optional()
	.transform((value, ctx) => {
		const cents = parseMoney(value ?? '');
		if (Number.isNaN(cents)) {
			ctx.addIssue({ code: 'custom', message: 'Enter an amount, like 1,500' });
			return z.NEVER;
		}
		return cents;
	});

/** Accepts "2026-10" (from <input type="month">) or "2026-10-01". */
export const month = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/, 'Pick a month')
	.transform((v) => `${v.slice(0, 7)}-01`);

export const checkbox = z
	.string()
	.optional()
	.transform((v) => v === 'on' || v === 'true');

export const id = z.coerce.number().int().positive();
export const name = z.string().trim().min(1, 'Give it a name').max(100);
const count = z.coerce.number().int().min(0).max(1000);
const decimal = z.coerce.number().min(0).max(1000);

export const incomeCategory = z.enum(['tutoring', 'dog_walking', 'other']);
export const incomeFrequency = z.enum(['weekly', 'biweekly', 'monthly']);
export const costFrequency = z.enum(['monthly', 'quarterly', 'annual', 'one_time']);
export const accountType = z.enum([
	'checking',
	'savings',
	'tax_reserve',
	'investment',
	'credit_card',
	'other'
]);

export const newCost = z.object({
	name,
	amount: money,
	frequency: costFrequency,
	start_month: month,
	due_month: z.coerce.number().int().min(1).max(12).optional(),
	is_variable: checkbox,
	is_tax: checkbox
});

export const newIncome = z.object({
	name,
	category: incomeCategory,
	rate: money,
	frequency: incomeFrequency,
	quantity: count.default(1),
	summer_quantity: count.default(0),
	start_month: month
});

export const newAccount = z.object({
	name,
	type: accountType,
	counts_toward_spending: checkbox
});

export const updateCost = z.object({
	id,
	name,
	frequency: costFrequency,
	due_month: z.coerce.number().int().min(1).max(12).optional(),
	is_variable: checkbox,
	is_tax: checkbox
});

export const updateIncome = z.object({
	id,
	name,
	category: incomeCategory,
	frequency: incomeFrequency
});

export const updateAccount = z.object({
	id,
	name,
	type: accountType,
	counts_toward_spending: checkbox
});

export const newAmount = z.object({ id, amount: money, effective_from: month });

export const newRate = z.object({
	id,
	rate: money,
	quantity: count,
	summer_quantity: count,
	effective_from: month
});

export const removeRow = z.object({ id, row_id: id });
export const stop = z.object({ id, end_month: month });
export const byId = z.object({ id });
export const reorder = z.object({
	ids: z
		.string()
		.transform((s) => s.split(',').map(Number))
		.pipe(z.array(z.number().int().positive()))
});

export const settings = z.object({
	tutoring_cancellations_per_week: decimal,
	dog_cancellations_per_week: decimal,
	summer_tutoring_hours_per_week: decimal,
	summer_tutoring_rate: money,
	monthly_savings_goal: money,
	...Object.fromEntries(
		Array.from({ length: 12 }, (_, i) => [
			`reduced_${String(i + 1).padStart(2, '0')}`,
			z.coerce.number().min(0).max(5)
		])
	)
});

export const login = z.object({
	email: z.email('Enter your email'),
	password: z.string().min(1, 'Enter your password')
});

// The monthly entry form posts one JSON payload, mirroring expenses_save_month().
const cents = z.number().int();
export const monthPayload = z.object({
	month: month,
	discretionary_spent_cents: cents.nullable(),
	notes: z.string().max(5000),
	balances: z.array(z.object({ account_id: id, balance_cents: cents })),
	income: z.array(z.object({ income_source_id: id, amount_cents: cents })),
	costs: z.array(z.object({ cost_item_id: id, amount_cents: cents })),
	extras: z.array(z.object({ kind: z.enum(['income', 'cost']), name, amount_cents: cents })),
	cost_amount_changes: z.array(z.object({ cost_item_id: id, amount_cents: cents.min(0) })),
	new_income_sources: z.array(
		z.object({
			name,
			category: incomeCategory,
			frequency: incomeFrequency,
			rate_cents: cents.min(0),
			quantity: z.number().int().min(0),
			summer_quantity: z.number().int().min(0),
			amount_cents: cents
		})
	),
	new_cost_items: z.array(
		z.object({
			name,
			frequency: costFrequency,
			due_month: z.number().int().min(1).max(12).nullable(),
			is_tax: z.boolean(),
			is_variable: z.boolean(),
			amount_cents: cents.min(0)
		})
	)
});
export type MonthPayload = z.input<typeof monthPayload>;

/** Parse FormData with a schema; returns data or the first error message. */
export function parseForm<T extends z.ZodType>(
	schema: T,
	form: FormData
): { ok: true; data: z.output<T> } | { ok: false; message: string } {
	const result = schema.safeParse(Object.fromEntries(form));
	if (result.success) return { ok: true, data: result.data };
	return { ok: false, message: result.error.issues[0]?.message ?? 'Check the form' };
}
