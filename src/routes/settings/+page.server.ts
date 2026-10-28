import { fail } from '@sveltejs/kit';
import { parseForm, settings } from '#lib/schemas.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const parsed = parseForm(settings, await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });

		const { error } = await locals.supabase
			.from('expenses_settings')
			.update({ monthly_savings_goal_cents: parsed.data.monthly_savings_goal })
			.eq('user_id', locals.user!.id);
		if (error) return fail(500, { message: error.message });
		return { message: 'Settings saved' };
	}
};
