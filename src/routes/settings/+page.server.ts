import { fail } from '@sveltejs/kit';
import { parseForm, settings } from '#lib/schemas.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const parsed = parseForm(settings, await request.formData());
		if (!parsed.ok) return fail(400, { message: parsed.message });
		const d = parsed.data;

		const reduced: Record<string, number> = {};
		for (let i = 1; i <= 12; i++) {
			const key = String(i).padStart(2, '0');
			reduced[key] = Number(d[`reduced_${key}` as keyof typeof d]);
		}

		const { error } = await locals.supabase
			.from('expenses_settings')
			.update({
				tutoring_cancellations_per_week: d.tutoring_cancellations_per_week,
				dog_cancellations_per_week: d.dog_cancellations_per_week,
				summer_tutoring_hours_per_week: d.summer_tutoring_hours_per_week,
				summer_tutoring_rate_cents: d.summer_tutoring_rate,
				monthly_savings_goal_cents: d.monthly_savings_goal,
				reduced_weeks_by_month: reduced,
				configured_at: new Date().toISOString()
			})
			.eq('user_id', locals.user!.id);
		if (error) return fail(500, { message: error.message });
		return { message: 'Settings saved' };
	}
};
