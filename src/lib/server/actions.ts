// Form action handlers shared by the quick-add sheet and the list pages.

import { fail, type Action } from '@sveltejs/kit';
import * as s from '#lib/schemas.ts';
import { addAccount, addCostItem, addIncomeSource, reorder, type DB } from './data';

type Result = { message: string };

function done(message: string): Result {
	return { message };
}

function dbFail(error: { message: string } | null) {
	return error ? fail(500, { message: error.message }) : null;
}

/** Wrap a handler so it receives validated data and the Supabase client. */
function action<T extends import('zod').ZodType>(
	schema: T,
	run: (db: DB, data: import('zod').output<T>) => Promise<ReturnType<typeof fail> | Result>
): Action {
	return async ({ request, locals }) => {
		const parsed = s.parseForm(schema, await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		return run(locals.supabase, parsed.data);
	};
}

// --- quick add --------------------------------------------------------------

export const addExpense = action(s.newCost, async (db, d) => {
	await addCostItem(db, {
		name: d.name,
		frequency: d.frequency,
		amount_cents: d.amount,
		start_month: d.start_month,
		due_month: d.due_month ?? Number(d.start_month.slice(5, 7)),
		is_tax: d.is_tax,
		is_variable: d.is_variable
	});
	return done('Expense added');
});

export const addIncome = action(s.newIncome, async (db, d) => {
	await addIncomeSource(db, {
		name: d.name,
		category: d.category,
		frequency: d.frequency,
		rate_cents: d.rate,
		quantity: d.quantity,
		summer_quantity: d.summer_quantity,
		start_month: d.start_month
	});
	return done('Income added');
});

export const addAccountAction = action(s.newAccount, async (db, d) => {
	await addAccount(db, d);
	return done('Account added');
});

// --- costs --------------------------------------------------------------------

export const costActions = {
	update: action(s.updateCost, async (db, d) => {
		const { error } = await db
			.from('expenses_cost_items')
			.update({
				name: d.name,
				frequency: d.frequency,
				due_month: d.frequency === 'annual' ? (d.due_month ?? null) : null,
				is_tax: d.is_tax,
				is_variable: d.is_variable
			})
			.eq('id', d.id);
		return dbFail(error) ?? done('Saved');
	}),
	amount: action(s.newAmount, async (db, d) => {
		const { error } = await db.from('expenses_cost_item_amounts').upsert(
			{ cost_item_id: d.id, effective_from: d.effective_from, amount_cents: d.amount },
			{ onConflict: 'cost_item_id,effective_from' }
		);
		return dbFail(error) ?? done('Amount updated');
	}),
	removeAmount: action(s.removeRow, async (db, d) => {
		const { count } = await db
			.from('expenses_cost_item_amounts')
			.select('id', { count: 'exact', head: true })
			.eq('cost_item_id', d.id);
		if ((count ?? 0) <= 1) return fail(400, { message: 'An expense needs at least one amount' });
		const { error } = await db
			.from('expenses_cost_item_amounts')
			.delete()
			.eq('id', d.row_id)
			.eq('cost_item_id', d.id);
		return dbFail(error) ?? done('Change removed');
	}),
	stop: action(s.stop, async (db, d) => {
		const { error } = await db
			.from('expenses_cost_items')
			.update({ end_month: d.end_month })
			.eq('id', d.id);
		return dbFail(error) ?? done('Expense stopped');
	}),
	restart: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_cost_items').update({ end_month: null }).eq('id', d.id);
		return dbFail(error) ?? done('Expense restarted');
	}),
	reorder: action(s.reorder, async (db, d) => {
		await reorder(db, 'expenses_cost_items', d.ids);
		return done('Order saved');
	})
};

// --- income -------------------------------------------------------------------

export const incomeActions = {
	update: action(s.updateIncome, async (db, d) => {
		const { error } = await db
			.from('expenses_income_sources')
			.update({ name: d.name, category: d.category, frequency: d.frequency })
			.eq('id', d.id);
		return dbFail(error) ?? done('Saved');
	}),
	rate: action(s.newRate, async (db, d) => {
		const { error } = await db.from('expenses_income_source_rates').upsert(
			{
				income_source_id: d.id,
				effective_from: d.effective_from,
				rate_cents: d.rate,
				quantity: d.quantity,
				summer_quantity: d.summer_quantity
			},
			{ onConflict: 'income_source_id,effective_from' }
		);
		return dbFail(error) ?? done('Rate updated');
	}),
	removeRate: action(s.removeRow, async (db, d) => {
		const { count } = await db
			.from('expenses_income_source_rates')
			.select('id', { count: 'exact', head: true })
			.eq('income_source_id', d.id);
		if ((count ?? 0) <= 1) return fail(400, { message: 'Income needs at least one rate' });
		const { error } = await db
			.from('expenses_income_source_rates')
			.delete()
			.eq('id', d.row_id)
			.eq('income_source_id', d.id);
		return dbFail(error) ?? done('Change removed');
	}),
	stop: action(s.stop, async (db, d) => {
		const { error } = await db
			.from('expenses_income_sources')
			.update({ end_month: d.end_month })
			.eq('id', d.id);
		return dbFail(error) ?? done('Income stopped');
	}),
	restart: action(s.byId, async (db, d) => {
		const { error } = await db
			.from('expenses_income_sources')
			.update({ end_month: null })
			.eq('id', d.id);
		return dbFail(error) ?? done('Income restarted');
	}),
	reorder: action(s.reorder, async (db, d) => {
		await reorder(db, 'expenses_income_sources', d.ids);
		return done('Order saved');
	})
};

// --- accounts -----------------------------------------------------------------

export const accountActions = {
	update: action(s.updateAccount, async (db, d) => {
		const { error } = await db
			.from('expenses_accounts')
			.update({ name: d.name, type: d.type, counts_toward_spending: d.counts_toward_spending })
			.eq('id', d.id);
		return dbFail(error) ?? done('Saved');
	}),
	archive: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_accounts').update({ archived: true }).eq('id', d.id);
		return dbFail(error) ?? done('Account archived');
	}),
	restore: action(s.byId, async (db, d) => {
		const { error } = await db.from('expenses_accounts').update({ archived: false }).eq('id', d.id);
		return dbFail(error) ?? done('Account restored');
	}),
	reorder: action(s.reorder, async (db, d) => {
		await reorder(db, 'expenses_accounts', d.ids);
		return done('Order saved');
	})
};
