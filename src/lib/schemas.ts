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

export const checkbox = z
	.string()
	.optional()
	.transform((v) => v === 'on' || v === 'true');

export const id = z.coerce.number().int().positive();
export const name = z.string().trim().min(1, 'Give it a name').max(100);
export const day = z.iso.date('Pick a date');

export const billFrequency = z.enum(['monthly', 'quarterly', 'annual']);
export const accountType = z.enum([
	'checking',
	'savings',
	'tax_reserve',
	'investment',
	'credit_card',
	'other'
]);

export const newBill = z.object({
	name,
	amount: money,
	frequency: billFrequency,
	is_tax: checkbox
});

export const updateBill = newBill.extend({ id });

export const newAccount = z.object({
	name,
	type: accountType,
	counts_toward_spending: checkbox
});

export const updateAccount = newAccount.extend({ id });

export const byId = z.object({ id });
export const reorder = z.object({
	ids: z
		.string()
		.transform((s) => s.split(',').map(Number))
		.pipe(z.array(z.number().int().positive()))
});

export const settings = z.object({ monthly_savings_goal: money });

export const login = z.object({
	email: z.email('Enter your email'),
	password: z.string().min(1, 'Enter your password')
});

// The check-in form posts one JSON payload, mirroring expenses_save_checkin().
export const checkinPayload = z.object({
	date: day,
	main_income_cents: z.number().int().min(0),
	notes: z.string().max(5000),
	balances: z.array(z.object({ account_id: id, balance_cents: z.number().int() }))
});
export type CheckinPayload = z.input<typeof checkinPayload>;

/** Parse FormData with a schema; returns data or the first error message. */
export function parseForm<T extends z.ZodType>(
	schema: T,
	form: FormData
): { ok: true; data: z.output<T> } | { ok: false; message: string } {
	const result = schema.safeParse(Object.fromEntries(form));
	if (result.success) return { ok: true, data: result.data };
	return { ok: false, message: result.error.issues[0]?.message ?? 'Check the form' };
}
