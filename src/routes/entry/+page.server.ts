import { redirect } from '@sveltejs/kit';
import { lastMonth, monthInput } from '#lib/format.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(307, `/entry/${monthInput(lastMonth())}`);
