// use:enhance callbacks that report results as toasts.

import { deserialize, type SubmitFunction } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { toast } from './toast.svelte';

/**
 * Submit in place: toast the action's message, refresh all data, and keep the current page.
 * `after` runs on success (close a sheet, leave edit mode).
 */
export function inPlace(after?: () => void): SubmitFunction {
	return () =>
		async ({ result }) => {
			if (result.type === 'success') {
				toast(String(result.data?.message ?? 'Saved'));
				await invalidateAll();
				after?.();
			} else if (result.type === 'failure') {
				toast(String(result.data?.message ?? 'Something went wrong'), 'error');
			} else if (result.type === 'error') {
				toast(result.error?.message ?? 'Something went wrong', 'error');
			} else if (result.type === 'redirect') {
				window.location.href = result.location;
			}
		};
}

/** Post to a form action from code (e.g. after a drag). Toasts failures, refreshes on success. */
export async function postAction(action: string, fields: Record<string, string>): Promise<boolean> {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const response = await fetch(action, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await response.text());
	if (result.type === 'success') {
		await invalidateAll();
		return true;
	}
	const message =
		result.type === 'failure'
			? result.data?.message
			: result.type === 'error'
				? result.error?.message
				: undefined;
	toast(String(message ?? 'Something went wrong'), 'error');
	return false;
}
