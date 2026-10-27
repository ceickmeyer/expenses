import { redirect } from '@sveltejs/kit';
import { addAccountAction, addExpense, addIncome } from '#lib/server/actions.ts';
import type { Actions, PageServerLoad } from './$types';

// Endpoint for the quick-add sheet, which posts here from every page.
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	expense: addExpense,
	income: addIncome,
	account: addAccountAction
};
