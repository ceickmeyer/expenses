// Cents <-> display helpers and forgiving currency input parsing.

const whole = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 0
});
const exact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "$1,500" (rounded to whole dollars). Negative values get a leading minus. */
export function formatMoney(cents: number, opts: { exact?: boolean } = {}): string {
	const fmt = opts.exact ? exact : whole;
	const dollars = cents / 100;
	const text = fmt.format(Math.abs(dollars));
	return dollars < 0 && text !== fmt.format(0) ? `−${text}` : text;
}

/** "$1,500" without a sign, for copy that carries the sign in words ("Draw $900"). */
export function formatAbs(cents: number): string {
	return formatMoney(Math.abs(cents));
}

/** "+$1,200" / "−$900" for changes. */
export function formatSigned(cents: number): string {
	const rounded = Math.round(cents / 100);
	if (rounded === 0) return formatMoney(0);
	return rounded > 0 ? `+${formatMoney(cents)}` : formatMoney(cents);
}

/** Value to put in a money <input>: "1,500" or "1,500.50"; empty for null. */
export function centsToInput(cents: number | null | undefined): string {
	if (cents === null || cents === undefined) return '';
	const negative = cents < 0;
	const abs = Math.abs(Math.round(cents));
	const dollars = Math.floor(abs / 100).toLocaleString('en-US');
	const rest = abs % 100;
	const text = rest === 0 ? dollars : `${dollars}.${String(rest).padStart(2, '0')}`;
	return negative ? `-${text}` : text;
}

/**
 * Parse "1,500", "1500", "$1,500.00", "-250", "(250)" into cents.
 * Returns null for blank input and NaN for something that isn't money.
 */
export function parseMoney(input: string | null | undefined): number | null {
	if (input === null || input === undefined) return null;
	let text = String(input).trim();
	if (text === '') return null;

	let negative = false;
	if (/^\(.*\)$/.test(text)) {
		negative = true;
		text = text.slice(1, -1);
	}
	text = text.replace(/[\s$,]/g, '').replace(/^[−–]/, '-');
	if (text.startsWith('-')) {
		negative = !negative;
		text = text.slice(1);
	}
	if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return NaN;

	const cents = Math.round(parseFloat(text) * 100);
	return negative ? -cents : cents;
}
