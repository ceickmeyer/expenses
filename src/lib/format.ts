// Display labels shared across pages.

import { toDay, type Day } from './budget';

const utc = (d: Day) => new Date(`${d}T00:00:00Z`);
const fmt = (options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });

const dayFull = fmt({ weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
const dayMedium = fmt({ month: 'short', day: 'numeric', year: 'numeric' });
const dayShort = fmt({ month: 'short', day: 'numeric' });
const dateLong = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});

export const today = (): Day => toDay(new Date());

/** "Tue, October 27, 2026" */
export const dayLabel = (d: Day) => dayFull.format(utc(d));
/** "Oct 27, 2026" */
export const dayMediumLabel = (d: Day) => dayMedium.format(utc(d));
/** "Oct 27" */
export const dayShortLabel = (d: Day) => dayShort.format(utc(d));
/** "January 15, 2027" for a local Date. */
export const dateLabel = (d: Date) => dateLong.format(d);

/** "Sep 27 – Oct 27", "Oct 1 – 27" */
export function periodLabel(start: Day, end: Day): string {
	if (start.slice(0, 7) === end.slice(0, 7))
		return `${dayShortLabel(start)} – ${Number(end.slice(8))}`;
	return `${dayShortLabel(start)} – ${dayShortLabel(end)}`;
}

export const billFrequencyLabel = {
	monthly: 'a month',
	quarterly: 'a quarter',
	annual: 'a year'
} as const;

export const billFrequencyOption = {
	monthly: 'Monthly',
	quarterly: 'Quarterly',
	annual: 'Yearly'
} as const;

export const accountTypeLabel = {
	checking: 'Checking',
	savings: 'Savings',
	tax_reserve: 'Tax reserve',
	investment: 'Investment',
	credit_card: 'Credit card',
	other: 'Other'
} as const;

/** Whether an account type usually counts toward growth (investments move on their own). */
export const countsByDefault = (type: keyof typeof accountTypeLabel) =>
	type !== 'investment' && type !== 'tax_reserve';
