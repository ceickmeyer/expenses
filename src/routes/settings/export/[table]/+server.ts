import { error } from '@sveltejs/kit';
import { EXPORTS } from '#lib/exports.ts';
import type { RequestHandler } from './$types';

// One CSV per table. RLS limits every query to the signed-in user's rows.

function cell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const table = EXPORTS[params.table as keyof typeof EXPORTS]?.table;
	if (!table) error(404, 'Unknown export');

	const { data, error: dbError } = await locals.supabase.from(table).select('*');
	if (dbError) error(500, dbError.message);

	const rows = (data ?? []) as Record<string, unknown>[];
	const columns = rows.length ? Object.keys(rows[0]).filter((c) => c !== 'user_id') : [];
	const csv = [
		columns.join(','),
		...rows.map((r) => columns.map((c) => cell(r[c])).join(','))
	].join('\r\n');

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="money-${params.table}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
