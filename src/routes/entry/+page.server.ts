import { redirect } from '@sveltejs/kit';
import { today } from '#lib/format.ts';
import type { PageServerLoad } from './$types';

// New entries default to today. The page has a date picker to back-date one.
export const load: PageServerLoad = ({ url }) =>
	redirect(307, `/entry/${url.searchParams.get('date') ?? today()}`);
