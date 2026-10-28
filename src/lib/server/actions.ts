// Form action handlers shared by the quick-add sheet and the list pages.

import { fail, type Action } from '@sveltejs/kit';
import type { z } from 'zod';
import * as s from '#lib/schemas.ts';
import { nextSortOrder, reorder, type DB } from './data.ts';

type Result = { message: string };

function dbResult(error: { message: string } | null, message: string) {
	return error ? fail(500, { message: error.message }) : ({ message } satisfies Result);
}

/** Wrap a handler so it receives validated data and the Supabase client. */
function action<T extends z.ZodType>(
	schema: T,
	run: (db: DB, data: z.output<T>) => Promise<ReturnType<typeof fail> | Result>
): Action {
	return async ({ request, locals }) => {
		const parsed = s.parseForm(schema, await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		return run(locals.supabase, parsed.data);
	};
}

// --- quick add --------------------------------------------------------------

export const addBill = action(s.newBill, async (db, d) => {
	const sort_order = await nextSortOrder(db, 'expenses_bills');
	const { error } = await db.from('expenses_bills').insert({
		name: d.name,
		amount_cents: d.amount,
		frequency: d.frequency,
		is_tax: d.is_tax,
		sort_order
	});
	return dbResult(error, 'Bill added');
});

export const addAccount = action(s.newAccount, async (db, d) => {
	const sort_order = await nextSortOrder(db, 'expenses_accounts');
	const { error } = await db.from('expenses_accounts').insert({ ...d, sort_order });
	return dbResult(error, 'Account added');
});

// --- bills --------------------------------------------------------------------

export const billActions = {
	update: action(s.updateBill, async (db, d) => {
		const { error } = await db
			.from('expenses_bills')
			.update({ name: d.name, amount_cents: d.amount, frequency: d.frequency, is_tax: d.is_tax })
			.eq('id', d.id);
		return dbResult(error, 'Bill saved');
	}),
	archive: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_bills').update({ archived: true }).eq('id', d.id);
		return dbResult(error, 'Bill stopped');
	}),
	restore: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_bills').update({ archived: false }).eq('id', d.id);
		return dbResult(error, 'Bill restarted');
	}),
	reorder: action(s.reorder, async (db, d) => {
		await reorder(db, 'expenses_bills', d.ids);
		return { message: 'Order saved' };
	})
};

// --- accounts -----------------------------------------------------------------

export const accountActions = {
	update: action(s.updateAccount, async (db, d) => {
		const { error } = await db
			.from('expenses_accounts')
			.update({ name: d.name, type: d.type, counts_toward_spending: d.counts_toward_spending })
			.eq('id', d.id);
		return dbResult(error, 'Account saved');
	}),
	archive: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_accounts').update({ archived: true }).eq('id', d.id);
		return dbResult(error, 'Account archived');
	}),
	restore: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_accounts').update({ archived: false }).eq('id', d.id);
		return dbResult(error, 'Account restored');
	}),
	reorder: action(s.reorder, async (db, d) => {
		await reorder(db, 'expenses_accounts', d.ids);
		return { message: 'Order saved' };
	})
};
