import { fail, redirect } from '@sveltejs/kit';
import { login, parseForm } from '#lib/schemas.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const parsed = parseForm(login, form);
		if (!parsed.ok) return fail(400, { email, message: parsed.message });

		const { error } = await locals.supabase.auth.signInWithPassword(parsed.data);
		if (error) return fail(400, { email, message: 'That email and password didn’t match.' });

		redirect(303, '/');
	}
};
