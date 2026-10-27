import { ensureSettings, loadAppData } from '#lib/server/data.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { email: null, app: null };

	let app = await loadAppData(locals.supabase);
	if (!app.settingsExists) {
		// First login: create the settings row with neutral defaults.
		await ensureSettings(locals.supabase);
		app = await loadAppData(locals.supabase);
	}
	return { email: locals.user.email ?? null, app };
};
