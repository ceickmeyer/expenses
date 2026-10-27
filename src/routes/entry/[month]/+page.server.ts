import { error, fail } from '@sveltejs/kit';
import { monthPayload } from '#lib/schemas.ts';
import type { Actions, PageServerLoad } from './$types';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const load: PageServerLoad = ({ params }) => {
	if (!MONTH.test(params.month)) error(404, 'Not a month');
	return { month: `${params.month}-01` };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const form = await request.formData();
		let json: unknown;
		try {
			json = JSON.parse(String(form.get('payload') ?? ''));
		} catch {
			return fail(400, { message: 'The form couldn’t be read. Try again.' });
		}

		const parsed = monthPayload.safeParse(json);
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Check the form' });
		}
		if (parsed.data.month !== `${params.month}-01`) {
			return fail(400, { message: 'Month doesn’t match the page' });
		}

		const { error: rpcError } = await locals.supabase.rpc('expenses_save_month', {
			payload: parsed.data
		});
		if (rpcError) return fail(500, { message: rpcError.message });

		return { message: 'Month saved' };
	}
};
