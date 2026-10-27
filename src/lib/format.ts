// Display labels shared across pages.

import { addMonths, monthOf, type Month } from './budget';

const monthLong = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});
const monthShort = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});
const monthTiny = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const dayLong = new Intl.DateTimeFormat('en-US', {
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});

const utc = (m: Month) => new Date(`${m}T00:00:00Z`);

export const monthLabel = (m: Month) => monthLong.format(utc(m));
export const monthShortLabel = (m: Month) => monthShort.format(utc(m));
export const monthTinyLabel = (m: Month) => monthTiny.format(utc(m));
export const dateLabel = (d: Date) => dayLong.format(d);

/** "2026-10-01" -> "2026-10" for <input type="month"> and URLs. */
export const monthInput = (m: Month) => m.slice(0, 7);

export const thisMonth = () => monthOf(new Date());
export const lastMonth = () => addMonths(thisMonth(), -1);

export const incomeFrequencyLabel = {
	weekly: 'weekly',
	biweekly: 'every 2 weeks',
	monthly: 'monthly'
} as const;

export const costFrequencyLabel = {
	monthly: 'a month',
	quarterly: 'a quarter',
	annual: 'a year',
	one_time: 'one time'
} as const;

export const costFrequencyOption = {
	monthly: 'Monthly',
	quarterly: 'Quarterly',
	annual: 'Yearly',
	one_time: 'One time'
} as const;

export const categoryLabel = {
	tutoring: 'Tutoring',
	dog_walking: 'Dog walking',
	other: 'Other'
} as const;

export const accountTypeLabel = {
	checking: 'Checking',
	savings: 'Savings',
	tax_reserve: 'Tax reserve',
	investment: 'Investment',
	credit_card: 'Credit card',
	other: 'Other'
} as const;

export const monthNames = Array.from({ length: 12 }, (_, i) =>
	monthTiny.format(new Date(Date.UTC(2000, i, 1)))
);
