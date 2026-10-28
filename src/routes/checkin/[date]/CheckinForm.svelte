<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		balanceTable,
		periods,
		sortedCheckins,
		summary,
		type Checkin,
		type Day
	} from '#lib/budget.ts';
	import { dayShortLabel } from '#lib/format.ts';
	import { centsToInput, formatMoney, formatSigned, parseMoney } from '#lib/money.ts';
	import type { CheckinPayload } from '#lib/schemas.ts';
	import type { AppData } from '#lib/server/data.ts';
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
	const existing = initial.app.checkins.find((c) => c.date === initial.date);
	const earlier = sortedCheckins(initial.app.checkins).filter((c) => c.date < initial.date);
	const prev = earlier.at(-1);
	const known = balanceTable(initial.app.accounts, earlier);

	const amount = (cents: number | null | undefined) =>
		cents === null || cents === undefined ? '' : centsToInput(cents);

	const balances = $state(
		initial.app.accounts
			.filter((a) => !a.archived)
			.map((account) => {
				const before = known.get(account.id)?.at(-1) ?? null;
				const own = existing?.balances[account.id];
				return { account, before, text: amount(own ?? before) };
			})
	);
	let mainText = $state(existing ? amount(existing.main_income_cents) : '');
	let notes = $state(existing?.notes ?? '');

	const cents = (text: string) => {
		const v = parseMoney(text);
		return v === null || Number.isNaN(v) ? null : v;
	};

	// Live preview: the period ending at this check-in, and the headline with it saved.
	const preview = $derived.by(() => {
		const draft: Checkin = {
			date,
			main_income_cents: cents(mainText) ?? 0,
			balances: Object.fromEntries(
				balances.flatMap((b) => {
					const v = cents(b.text);
					return v === null ? [] : [[b.account.id, v]];
				})
			)
		};
		const data = { ...app, checkins: [...app.checkins.filter((c) => c.date !== date), draft] };
		const period = periods(data).find((p) => p.end === date) ?? null;
		return { period, summary: summary(data) };
	});

	function buildPayload(): CheckinPayload | string {
		const payload: CheckinPayload = { date, main_income_cents: 0, notes, balances: [] };
		for (const b of balances) {
			const v = parseMoney(b.text);
			if (Number.isNaN(v)) return `Check the balance for ${b.account.name}`;
			if (v !== null) payload.balances.push({ account_id: b.account.id, balance_cents: v });
		}
		const main = parseMoney(mainText);
		if (Number.isNaN(main) || (main !== null && main < 0)) return 'Check the main job amount';
		payload.main_income_cents = main ?? 0;
		return payload;
	}

	let saving = $state(false);

	/** Enter moves to the next field instead of submitting mid-form. */
	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.key !== 'Enter' || target.tagName !== 'INPUT') return;
		event.preventDefault();
		const fields = [
			...(event.currentTarget as HTMLFormElement).querySelectorAll<HTMLElement>(
				'input:not([type=hidden]), textarea, button[type=submit]'
			)
		];
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
				toast('Check-in saved');
				await goto('/', { invalidateAll: true });
			} else if (result.type === 'failure') {
				toast(String(result.data?.message ?? 'Couldn’t save'), 'error');
			} else if (result.type === 'error') {
				toast(result.error?.message ?? 'Couldn’t save', 'error');
			}
		};
	}}
>
	<section class="panel">
		<h2>Balances</h2>
		<p class="small muted">
			What each account shows today. Credit cards as a negative number.
			{#if prev}Filled in from {dayShortLabel(prev.date)}.{/if}
		</p>
		{#if balances.length === 0}
			<p class="empty small">
				No accounts yet. <a href="/accounts">Add your accounts</a> first.
			</p>
		{/if}
		<div class="lines">
			{#each balances as b (b.account.id)}
				{@const now = cents(b.text)}
				<label class="line">
					<span class="line-name">
						{b.account.name}
						{#if b.before !== null && now !== null && now !== b.before}
							<span class="small num" class:pos={now > b.before} class:neg={now < b.before}
								>{formatSigned(now - b.before)}</span
							>
						{/if}
						{#if !b.account.counts_toward_spending}<span class="tag">Not in growth</span>{/if}
					</span>
					<MoneyInput bind:value={b.text} />
				</label>
			{/each}
		</div>
	</section>

	<section class="panel">
		<h2>Main job</h2>
		<label class="line">
			<span class="line-name"
				>Pay received {prev ? `since ${dayShortLabel(prev.date)}` : 'this month'}</span
			>
			<MoneyInput bind:value={mainText} placeholder="0" />
		</label>
		<p class="small muted" style="margin: 0.4rem 0 0">
			Everything else — tutoring, dog walking, spending — is worked out from your balances.
		</p>
	</section>

	{#if preview.period}
		{@const p = preview.period}
		<section class="panel preview" aria-live="polite">
			<h2>Since {dayShortLabel(p.start)} <span class="muted small">· {p.days} days</span></h2>
			<dl>
				<div>
					<dt>Balances grew</dt>
					<dd class="num">{formatSigned(p.growth)}</dd>
				</div>
				<div>
					<dt>Main job</dt>
					<dd class="num">{formatMoney(p.mainIncome)}</dd>
				</div>
				<div>
					<dt>Bills</dt>
					<dd class="num">−{formatMoney(p.bills)}</dd>
				</div>
				<div class="em">
					<dt>Everything else</dt>
					<dd class="num">{formatSigned(p.other)}</dd>
				</div>
			</dl>
			<p class="small muted">
				Everything else = growth − main job + bills: your side income minus day-to-day spending.
			</p>
			{#if preview.summary}
				<p class="headline-preview">
					With this check-in: <strong class="num"
						>{formatSigned(preview.summary.perDay)} a day</strong
					>
					{preview.summary.perDay >= 0 ? 'of extra room' : 'to cut back'}
				</p>
			{/if}
		</section>
	{:else if !prev}
		<section class="panel">
			<p class="small muted" style="margin: 0">
				This is your first check-in. Growth shows up from your next one.
			</p>
		</section>
	{/if}

	<section class="panel">
		<label>Notes <textarea bind:value={notes} rows="2"></textarea></label>
	</section>

	<div class="save">
		<button type="submit" class="primary" disabled={saving}
			>{saving ? 'Saving…' : 'Save check-in'}</button
		>
	</div>
</form>

<style>
	form {
		display: grid;
	}
	h2 {
		font-size: var(--step-1);
		margin-bottom: 0.5rem;
	}
	.lines {
		display: grid;
	}
	.line {
		display: grid;
		grid-template-columns: 1fr minmax(7.5rem, 9.5rem);
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0;
		color: var(--ink);
		font-size: var(--step-0);
		font-weight: 500;
	}
	.lines .line + .line {
		border-top: 1px solid var(--line);
	}
	.line-name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.1rem 0.5rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.line-name .small {
		font-weight: 600;
	}
	.preview dl {
		margin: 0 0 0.5rem;
		display: grid;
	}
	.preview dl div {
		display: flex;
		justify-content: space-between;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line);
	}
	.preview dt {
		color: var(--muted);
	}
	.preview dd {
		margin: 0;
	}
	.preview .em dt,
	.preview .em dd {
		color: var(--ink);
		font-weight: 600;
	}
	.headline-preview {
		margin: 0.5rem 0 0;
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
