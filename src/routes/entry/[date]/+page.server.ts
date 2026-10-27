import { error, fail } from '@sveltejs/kit';
import { day, entryPayload } from '#lib/schemas.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	if (!day.safeParse(params.date).success) error(404, 'Not a date');
	return { date: params.date };
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

		const parsed = entryPayload.safeParse(json);
		if (!parsed.success) {
			return fail(400, { message: parsed.error.issues[0]?.message ?? 'Check the form' });
		}
		if (parsed.data.date !== params.date) {
			return fail(400, { message: 'Date doesn’t match the page' });
		}

		const { error: rpcError } = await locals.supabase.rpc('expenses_save_entry', {
			payload: parsed.data
		});
		if (rpcError) return fail(500, { message: rpcError.message });

		return { message: 'Entry saved' };
	}
};
