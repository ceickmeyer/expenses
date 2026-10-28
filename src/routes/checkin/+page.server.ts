import { redirect } from '@sveltejs/kit';
import { today } from '#lib/format.ts';
import type { PageServerLoad } from './$types';

// New check-ins default to today. The page has a date picker to back-date one.
export const load: PageServerLoad = () => redirect(307, `/checkin/${today()}`);
