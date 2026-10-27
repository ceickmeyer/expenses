<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		addDays,
		dueDatesIn,
		entryPeriod,
		expectedCostForPeriod,
		expectedIncomeForPeriod,
		isActive,
		latestSnapshot,
		monthOfDay,
		previousEntry,
		projection,
		type Day,
		type Entry
	} from '#lib/budget.ts';
	import {
		categoryLabel,
		costFrequencyOption,
		dayShortLabel,
		monthShortLabel,
		periodLabel
	} from '#lib/format.ts';
	import { centsToInput, formatAbs, formatMoney, formatSigned, parseMoney } from '#lib/money.ts';
	import type { EntryPayload } from '#lib/schemas.ts';
	import type { AppData, CostRow } from '#lib/server/data.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';

	interface Props {
		app: AppData;
		date: Day;
	}

	let { app, date }: Props = $props();

	// The form is keyed on the date by the parent, so it's fine to read props once here.
	/* svelte-ignore state_referenced_locally */
	const initial = { app, date };
	const entry = initial.app.entries.find((e) => e.date === initial.date);
	const prev = previousEntry(initial.app.entries, initial.date);
	/** The days this entry covers: since the previous entry (or the 1st, for the first one). */
	const period = entryPeriod(initial.app.entries, initial.date);
	const since = prev ? `since ${dayShortLabel(prev.date)}` : `since ${dayShortLabel(period.start)}`;
	const activeInPeriod = (item: Parameters<typeof isActive>[0]) =>
		isActive(item, monthOfDay(period.start)) || isActive(item, monthOfDay(period.end));
	// Other entries, for variable-cost averages (this entry's own amounts shouldn't feed them).
	const otherEntries = initial.app.entries.filter((e) => e.date !== initial.date);

	const amount = (cents: number | null | undefined) =>
		cents === null || cents === undefined ? '' : centsToInput(Math.round(cents));

	// --- Balances -----------------------------------------------------------------

	const balances = $state(
		initial.app.accounts
			.filter((a) => !a.archived)
			.map((account) => {
				const own = initial.app.snapshots.find(
					(s) => s.account_id === account.id && s.as_of === initial.date
				);
				const before = latestSnapshot(initial.app.snapshots, account.id, addDays(initial.date, -1));
				return {
					account,
					text: amount(own?.balance_cents ?? before?.balance_cents),
					// Balance on the previous entry, for the change since then.
					previous: prev
						? initial.app.snapshots.find(
								(s) => s.account_id === account.id && s.as_of === prev.date
							)?.balance_cents
						: undefined,
					prefilled: !own && before !== undefined
				};
			})
	);

	// --- Income -------------------------------------------------------------------

	const expectedBySource = expectedIncomeForPeriod(
		initial.app.sources,
		initial.app.settings,
		period.start,
		period.end
	);
	const income = $state(
		initial.app.sources
			.filter((s) => activeInPeriod(s) || (entry && s.id in entry.income))
			.map((source) => ({
				source,
				expected: expectedBySource.get(source.id) ?? 0,
				text: entry ? amount(entry.income[source.id]) : amount(expectedBySource.get(source.id))
			}))
	);

	// --- Costs --------------------------------------------------------------------

	const costs = $state(
		initial.app.costs
			.filter((c) => activeInPeriod(c) || (entry && c.id in entry.costs))
			.map((item) => {
				const due = expectedCostForPeriod(item, otherEntries, period.start, period.end);
				return {
					item,
					due,
					/** Payments due in the period; the change prompt only makes sense for one. */
					payments: dueDatesIn(item, period.start, period.end).length,
					/** Shown in the main list; otherwise tucked under "Not due in this period". */
					main: due > 0 || (entry !== undefined && item.id in entry.costs),
					text: entry ? amount(entry.costs[item.id]) : due > 0 ? amount(due) : '',
					useFromNow: false
				};
			})
	);
	const dueCosts = $derived(costs.filter((c) => c.main));
	const otherCosts = $derived(costs.filter((c) => !c.main));

	/** "Rent was $1,650, expected $1,500" — only for a single fixed payment that was due. */
	function changed(line: (typeof costs)[number]): number | null {
		if (line.item.is_variable || line.due <= 0 || line.payments !== 1) return null;
		const cents = parseMoney(line.text);
		if (cents === null || Number.isNaN(cents) || cents <= 0) return null;
		return cents !== Math.round(line.due) ? cents : null;
	}

	// --- New and one-off rows -----------------------------------------------------

	interface NewIncome {
		key: number;
		name: string;
		text: string;
		repeat: boolean;
		category: 'tutoring' | 'dog_walking' | 'other';
		frequency: 'weekly' | 'biweekly' | 'monthly';
		rateText: string;
		quantity: number;
		summerQuantity: number;
	}
	interface NewCost {
		key: number;
		name: string;
		text: string;
		repeat: boolean;
		frequency: CostRow['frequency'];
		isVariable: boolean;
		isTax: boolean;
	}

	let nextKey = 0;
	const newIncome = $state<NewIncome[]>(
		(entry?.extras ?? [])
			.filter((x) => x.kind === 'income')
			.map((x) => blankIncome({ name: x.name, text: amount(x.amount_cents) }))
	);
	const newCosts = $state<NewCost[]>(
		(entry?.extras ?? [])
			.filter((x) => x.kind === 'cost')
			.map((x) => blankCost({ name: x.name, text: amount(x.amount_cents) }))
	);

	function blankIncome(partial: Partial<NewIncome> = {}): NewIncome {
		return {
			key: nextKey++,
			name: '',
			text: '',
			repeat: false,
			category: 'other',
			frequency: 'weekly',
			rateText: '',
			quantity: 1,
			summerQuantity: 0,
			...partial
		};
	}
	function blankCost(partial: Partial<NewCost> = {}): NewCost {
		return {
			key: nextKey++,
			name: '',
			text: '',
			repeat: false,
			frequency: 'monthly',
			isVariable: false,
			isTax: false,
			...partial
		};
	}

	async function addRow(list: 'income' | 'cost') {
		if (list === 'income') newIncome.push(blankIncome());
		else newCosts.push(blankCost());
		// Focus the new row's name field.
		await Promise.resolve();
		requestAnimationFrame(() =>
			document.querySelector<HTMLInputElement>(`[data-new="${list}"]:last-of-type input`)?.focus()
		);
	}

	// --- Spending and notes -------------------------------------------------------

	let spentText = $state(amount(entry?.discretionary_spent_cents));
	let notes = $state(entry?.notes ?? '');

	// --- Live totals --------------------------------------------------------------

	const cents = (text: string) => {
		const v = parseMoney(text);
		return v === null || Number.isNaN(v) ? 0 : v;
	};

	const totals = $derived.by(() => {
		const incomeTotal =
			income.reduce((sum, l) => sum + cents(l.text), 0) +
			newIncome.reduce((sum, l) => sum + cents(l.text), 0);
		const costTotal =
			costs.reduce((sum, l) => sum + cents(l.text), 0) +
			newCosts.reduce((sum, l) => sum + cents(l.text), 0);

		let change: number | null = null;
		for (const b of balances) {
			const now = parseMoney(b.text);
			if (b.previous === undefined || now === null || Number.isNaN(now)) continue;
			change = (change ?? 0) + now - b.previous;
		}
		const spent = parseMoney(spentText);
		const implied =
			(spent === null || Number.isNaN(spent)) && change !== null
				? incomeTotal - costTotal - change
				: null;

		// What the headline would be with this entry saved.
		const draft: Entry = {
			date,
			discretionary_spent_cents: spent === null || Number.isNaN(spent) ? null : spent,
			income: Object.fromEntries(income.map((l) => [l.source.id, cents(l.text)])),
			costs: Object.fromEntries(costs.map((l) => [l.item.id, cents(l.text)])),
			extras: [
				...newIncome.map((l) => ({
					kind: 'income' as const,
					name: l.name,
					amount_cents: cents(l.text)
				})),
				...newCosts.map((l) => ({
					kind: 'cost' as const,
					name: l.name,
					amount_cents: cents(l.text)
				}))
			]
		};
		const perDay = projection(
			{ ...app, entries: [...app.entries.filter((e) => e.date !== date), draft] },
			new Date()
		).perDay;

		return {
			incomeTotal,
			costTotal,
			expectedIncome: income.reduce((sum, l) => sum + l.expected, 0),
			expectedCosts: costs.reduce((sum, l) => sum + l.due, 0),
			change,
			implied,
			perDay
		};
	});

	// --- Submit -------------------------------------------------------------------

	function buildPayload(): EntryPayload | string {
		const money = (text: string, what: string): number | null | string => {
			const v = parseMoney(text);
			if (Number.isNaN(v)) return `Check the amount for ${what}`;
			return v;
		};

		const payload: EntryPayload = {
			date,
			discretionary_spent_cents: null,
			notes,
			balances: [],
			income: [],
			costs: [],
			extras: [],
			cost_amount_changes: [],
			new_income_sources: [],
			new_cost_items: []
		};

		for (const b of balances) {
			const v = money(b.text, b.account.name);
			if (typeof v === 'string') return v;
			if (v !== null) payload.balances.push({ account_id: b.account.id, balance_cents: v });
		}
		for (const l of income) {
			const v = money(l.text, l.source.name);
			if (typeof v === 'string') return v;
			if (v !== null) payload.income.push({ income_source_id: l.source.id, amount_cents: v });
		}
		for (const l of costs) {
			const v = money(l.text, l.item.name);
			if (typeof v === 'string') return v;
			if (v === null) continue;
			payload.costs.push({ cost_item_id: l.item.id, amount_cents: v });
			if (l.useFromNow && changed(l) !== null) {
				payload.cost_amount_changes.push({ cost_item_id: l.item.id, amount_cents: v });
			}
		}
		for (const l of newIncome) {
			if (!l.name.trim() && !l.text.trim()) continue;
			if (!l.name.trim()) return 'Give the new income a name';
			const v = money(l.text, l.name);
			if (typeof v === 'string') return v;
			if (!l.repeat) {
				payload.extras.push({ kind: 'income', name: l.name.trim(), amount_cents: v ?? 0 });
				continue;
			}
			const rate = l.rateText.trim() ? money(l.rateText, `${l.name} rate`) : v;
			if (typeof rate === 'string') return rate;
			payload.new_income_sources.push({
				name: l.name.trim(),
				category: l.category,
				frequency: l.frequency,
				rate_cents: rate ?? 0,
				quantity: l.quantity,
				summer_quantity: l.summerQuantity,
				amount_cents: v ?? 0
			});
		}
		for (const l of newCosts) {
			if (!l.name.trim() && !l.text.trim()) continue;
			if (!l.name.trim()) return 'Give the new expense a name';
			const v = money(l.text, l.name);
			if (typeof v === 'string') return v;
			if (!l.repeat) {
				payload.extras.push({ kind: 'cost', name: l.name.trim(), amount_cents: v ?? 0 });
				continue;
			}
			payload.new_cost_items.push({
				name: l.name.trim(),
				frequency: l.frequency,
				due_month: null,
				is_tax: l.isTax,
				is_variable: l.isVariable,
				amount_cents: v ?? 0
			});
		}
		const spent = money(spentText, 'total spending');
		if (typeof spent === 'string') return spent;
		payload.discretionary_spent_cents = spent;
		return payload;
	}

	let saving = $state(false);

	/** Enter moves to the next field instead of submitting mid-form. */
	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key !== 'Enter' || target.tagName !== 'INPUT') return;
		if ((target as HTMLInputElement).type === 'submit') return;
		event.preventDefault();
		const fields = [
			...(event.currentTarget as HTMLFormElement).querySelectorAll<HTMLElement>(
				'input:not([type=hidden]):not([disabled]), select, textarea, button[type=submit]'
			)
		].filter((el) => el.offsetParent !== null);
		fields[fields.indexOf(target) + 1]?.focus();
	}
</script>

<!-- Enter-to-next-field is handled by delegation on the form. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
	method="post"
	action="?/save"
	{onkeydown}
	use:enhance={({ formData, cancel }) => {
		const payload = buildPayload();
		if (typeof payload === 'string') {
			toast(payload, 'error');
			cancel();
			return;
		}
		formData.set('payload', JSON.stringify(payload));
		saving = true;
		return async ({ result }) => {
			saving = false;
			if (result.type === 'success') {
				toast('Entry saved');
				await goto('/', { invalidateAll: true });
			} else if (result.type === 'failure') {
				toast(String(result.data?.message ?? 'Couldn’t save'), 'error');
			} else if (result.type === 'error') {
				toast(result.error?.message ?? 'Couldn’t save', 'error');
			}
		};
	}}
>
	<section class="totals panel" aria-label="Totals so far">
		<div>
			<span class="eyebrow">Income</span>
			<strong class="num">{formatMoney(totals.incomeTotal)}</strong>
			<span class="small muted num">expected {formatMoney(totals.expectedIncome)}</span>
		</div>
		<div>
			<span class="eyebrow">Costs</span>
			<strong class="num">{formatMoney(totals.costTotal)}</strong>
			<span class="small muted num">expected {formatMoney(totals.expectedCosts)}</span>
		</div>
		<div>
			<span class="eyebrow">Left after costs</span>
			<strong class="num">{formatMoney(totals.incomeTotal - totals.costTotal)}</strong>
			{#if totals.implied !== null}
				<span class="small muted num">implied spending {formatMoney(totals.implied)}</span>
			{:else if totals.change !== null}
				<span class="small muted num">balances {formatSigned(totals.change)}</span>
			{/if}
		</div>
		<div>
			<span class="eyebrow">Spend per day</span>
			<strong class="num">{formatMoney(totals.perDay)}</strong>
			<span class="small muted">with this entry</span>
		</div>
	</section>

	<section class="panel">
		<h2>Balances today</h2>
		<p class="small muted">
			What each account shows as of this date. Credit cards as a negative number.
		</p>
		{#if balances.length === 0}
			<p class="empty small">
				No accounts yet. <a href="/accounts">Add your accounts</a> to track balances.
			</p>
		{/if}
		<div class="lines">
			{#each balances as b (b.account.id)}
				<label class="line">
					<span class="line-name"
						>{b.account.name}
						{#if b.prefilled}<span class="small muted">· last balance entered</span>{/if}</span
					>
					<MoneyInput bind:value={b.text} />
				</label>
			{/each}
		</div>
	</section>

	<section class="panel">
		<h2>Income {since}</h2>
		<p class="small muted">
			What came in over {periodLabel(period.start, period.end)} ({period.days}
			{period.days === 1 ? 'day' : 'days'}). Prefilled with what was expected.
		</p>
		<div class="lines">
			{#each income as l (l.source.id)}
				<label class="line">
					<span class="line-name"
						>{l.source.name}
						<span class="small muted num">expected {formatMoney(l.expected)}</span></span
					>
					<MoneyInput bind:value={l.text} />
				</label>
			{/each}
			{#each newIncome as l, i (l.key)}
				<fieldset class="new-row" data-new="income">
					<legend class="visually-hidden">New income</legend>
					<div class="new-main">
						<label>Name <input bind:value={l.name} placeholder="Workshop" /></label>
						<label>Amount <MoneyInput bind:value={l.text} /></label>
					</div>
					<div class="choice" role="radiogroup" aria-label="How often">
						<label class="check"
							><input type="radio" bind:group={l.repeat} value={false} />
							Just this once</label
						>
						<label class="check"
							><input type="radio" bind:group={l.repeat} value={true} /> Repeating</label
						>
					</div>
					{#if l.repeat}
						<div class="inline-row">
							<label
								>Category
								<select bind:value={l.category}>
									{#each Object.entries(categoryLabel) as [value, label] (value)}
										<option {value}>{label}</option>
									{/each}
								</select>
							</label>
							<label
								>How often
								<select bind:value={l.frequency}>
									<option value="weekly">Weekly</option>
									<option value="biweekly">Every 2 weeks</option>
									<option value="monthly">Monthly</option>
								</select>
							</label>
							<label>Rate <MoneyInput bind:value={l.rateText} placeholder="per session" /></label>
							<label>Clients <input type="number" min="0" bind:value={l.quantity} /></label>
							<label>In summer <input type="number" min="0" bind:value={l.summerQuantity} /></label>
						</div>
					{/if}
					<button type="button" class="quiet remove" onclick={() => newIncome.splice(i, 1)}
						>Remove</button
					>
				</fieldset>
			{/each}
		</div>
		<button type="button" class="quiet add-row" onclick={() => addRow('income')}
			>+ Add income</button
		>
	</section>

	<section class="panel">
		<h2>Costs {since}</h2>
		<p class="small muted">Bills due in this period are filled in. Others are underneath.</p>
		<div class="lines">
			{#each dueCosts as l (l.item.id)}
				{@render costLine(l)}
			{/each}
			{#each newCosts as l, i (l.key)}
				<fieldset class="new-row" data-new="cost">
					<legend class="visually-hidden">New expense</legend>
					<div class="new-main">
						<label>Name <input bind:value={l.name} placeholder="Vet bill" /></label>
						<label>Amount <MoneyInput bind:value={l.text} /></label>
					</div>
					<div class="choice" role="radiogroup" aria-label="How often">
						<label class="check"
							><input type="radio" bind:group={l.repeat} value={false} />
							Just this once</label
						>
						<label class="check"
							><input type="radio" bind:group={l.repeat} value={true} /> Repeating</label
						>
					</div>
					{#if l.repeat}
						<div class="inline-row">
							<label
								>How often
								<select bind:value={l.frequency}>
									{#each Object.entries(costFrequencyOption) as [value, label] (value)}
										{#if value !== 'one_time'}<option {value}>{label}</option>{/if}
									{/each}
								</select>
							</label>
						</div>
						<label class="check"
							><input type="checkbox" bind:checked={l.isVariable} /> Changes month to month</label
						>
						<label class="check"
							><input type="checkbox" bind:checked={l.isTax} /> This is a tax payment</label
						>
					{/if}
					<button type="button" class="quiet remove" onclick={() => newCosts.splice(i, 1)}
						>Remove</button
					>
				</fieldset>
			{/each}
		</div>
		<button type="button" class="quiet add-row" onclick={() => addRow('cost')}>+ Add expense</button
		>

		{#if otherCosts.length}
			<details class="not-due">
				<summary>Not due in this period ({otherCosts.length})</summary>
				<div class="lines">
					{#each otherCosts as l (l.item.id)}
						{@render costLine(l)}
					{/each}
				</div>
			</details>
		{/if}
	</section>

	<section class="panel">
		<h2>Spending {since}</h2>
		<label class="line">
			<span class="line-name"
				>Everything beyond the costs above <span class="small muted">· optional</span></span
			>
			<MoneyInput bind:value={spentText} />
		</label>
		<p class="small muted" style="margin: 0.5rem 0 0">
			Leave blank and it will be estimated from your balances.
		</p>
	</section>

	<section class="panel">
		<label>Notes <textarea bind:value={notes} rows="3"></textarea></label>
	</section>

	<div class="save">
		<button type="submit" class="primary" disabled={saving}
			>{saving ? 'Saving…' : 'Save entry'}</button
		>
	</div>
</form>

{#snippet costLine(l: (typeof costs)[number])}
	{@const different = changed(l)}
	<div class="cost-line">
		<label class="line">
			<span class="line-name"
				>{l.item.name}
				{#if l.item.is_tax}<span class="tag brass">Tax</span>{/if}
				<span class="small muted num">
					{#if l.due > 0}expected {formatMoney(l.due)}{:else}not due{/if}
				</span></span
			>
			<MoneyInput bind:value={l.text} />
		</label>
		{#if different !== null}
			<div class="prompt" role="status">
				<span
					>{l.item.name} was <strong class="num">{formatAbs(different)}</strong>, expected
					<span class="num">{formatAbs(l.due)}</span>.</span
				>
				<label class="check">
					<input type="checkbox" bind:checked={l.useFromNow} />
					Use {formatAbs(different)} from {monthShortLabel(monthOfDay(date))} on
				</label>
			</div>
		{/if}
	</div>
{/snippet}

<style>
	form {
		display: grid;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.9rem 1rem;
		position: sticky;
		top: 6.4rem;
		z-index: 5;
		box-shadow: var(--shadow-sm);
	}
	@media (min-width: 40rem) {
		.totals {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.totals div {
		display: grid;
		gap: 0.05rem;
	}
	.totals .eyebrow {
		margin: 0;
	}
	.totals strong {
		font-size: var(--step-1);
	}
	h2 {
		font-size: var(--step-1);
		margin-bottom: 0.5rem;
	}
	.lines {
		display: grid;
		gap: 0.25rem;
	}
	.line {
		display: grid;
		grid-template-columns: 1fr minmax(7.5rem, 9.5rem);
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem 0;
		color: var(--ink);
		font-size: var(--step-0);
		font-weight: 500;
	}
	.line-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.1rem 0.4rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.line-name .small {
		font-weight: 400;
	}
	.cost-line + .cost-line,
	.lines > .line + .line {
		border-top: 1px solid var(--line);
	}
	.prompt {
		display: grid;
		gap: 0.25rem;
		background: var(--brass-soft);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.75rem;
		margin-bottom: 0.4rem;
		font-size: var(--step--1);
	}
	.prompt .check {
		font-size: var(--step--1);
		font-weight: 600;
	}
	.new-row {
		border: 1px dashed var(--line);
		border-radius: var(--radius-sm);
		padding: 0.75rem;
		margin: 0.4rem 0;
		display: grid;
		gap: 0.6rem;
	}
	.new-main {
		display: grid;
		grid-template-columns: 1fr minmax(7.5rem, 9.5rem);
		gap: 0.6rem;
	}
	.choice {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
	}
	.remove {
		justify-self: start;
		min-height: 2.25rem;
	}
	.add-row {
		margin-top: 0.25rem;
		padding-left: 0;
		color: var(--moss);
		font-weight: 600;
	}
	.not-due {
		margin-top: 0.75rem;
	}
	.not-due .lines {
		margin-top: 0.5rem;
	}
	.save {
		position: sticky;
		bottom: 0;
		padding: 0.75rem 0 calc(0.75rem + env(safe-area-inset-bottom));
		background: linear-gradient(to top, var(--paper) 70%, transparent);
	}
	.save button {
		width: 100%;
		min-height: 3.25rem;
		font-size: var(--step-1);
	}
</style>
