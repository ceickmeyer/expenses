// Helpers for list pages: which items are ended, and the amount to show for "now".

import { resolveAt, type Month } from './budget';

export function isEnded(item: { end_month: Month | null }, now: Month): boolean {
	return item.end_month !== null && item.end_month < now;
}

/** The row that applies now, or the first one for items that haven't started yet. */
export function currentRow<T extends { effective_from: Month }>(
	rows: T[],
	now: Month
): T | undefined {
	return (
		resolveAt(rows, now) ??
		[...rows].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0]
	);
}

/** Rows newest first, for history lists. */
export function newestFirst<T extends { effective_from: Month }>(rows: T[]): T[] {
	return [...rows].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
}
