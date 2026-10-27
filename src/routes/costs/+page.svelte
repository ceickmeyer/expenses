<script lang="ts">
	import { enhance } from '$app/forms';
	import { monthlyCostTotal } from '#lib/budget.ts';
	import { inPlace, postAction } from '#lib/forms.ts';
	import {
		costFrequencyLabel,
		costFrequencyOption,
		monthInput,
		monthNames,
		monthShortLabel,
		thisMonth
	} from '#lib/format.ts';
	import { currentRow, isEnded, newestFirst } from '#lib/items.ts';
	import { centsToInput, formatMoney } from '#lib/money.ts';
	import { openQuickAdd } from '#lib/quickadd.svelte.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';
	import SortableList from '#lib/components/SortableList.svelte';
	import type { CostRow } from '#lib/server/data.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const now = thisMonth();

	const active = $derived(app.costs.filter((c) => !isEnded(c, now)));
	const ended = $derived(app.costs.filter((c) => isEnded(c, now)));
	const total = $derived(monthlyCostTotal(app.costs, app.entries, now));

	// Which row is open, and in which mode.
	let open = $state<{ id: number; mode: 'amount' | 'more' } | null>(null);
	let amountText = $state('');
	let editFrequency = $state<CostRow['frequency']>('monthly');

	function toggle(item: CostRow, mode: 'amount' | 'more') {
		if (open?.id === item.id && open.mode === mode) {
			open = null;
			return;
		}
		open = { id: item.id, mode };
		if (mode === 'amount') amountText = centsToInput(currentRow(item.amounts, now)?.amount_cents);
		editFrequency = item.frequency;
	}

	function meta(item: CostRow): string[] {
		const bits: string[] = [];
		if (item.frequency === 'annual')
			bits.push(
				`Yearly, paid in ${monthNames[(item.due_month ?? Number(item.start_month.slice(5, 7))) - 1]}`
			);
		else if (item.frequency === 'one_time')
			bits.push(`One time, ${monthShortLabel(item.start_month)}`);
		else bits.push(costFrequencyOption[item.frequency]);
		if (item.is_variable) bits.push('Changes month to month');
		if (item.start_month > now && item.frequency !== 'one_time')
			bits.push(`Starts ${monthShortLabel(item.start_month)}`);
		if (item.end_month) bits.push(`Last month ${monthShortLabel(item.end_month)}`);
		return bits;
	}
</script>

<svelte:head><title>Costs · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Costs</h1>
		<button type="button" class="primary" onclick={() => openQuickAdd('expense')}
			>+ Add expense</button
		>
	</div>

	{#if app.costs.length === 0}
		<div class="empty">
			<p><strong>Add each bill or regular payment.</strong></p>
			<p>
				Rent, phone, insurance, subscriptions and your quarterly estimated tax all belong here.
				Example: Rent, $1,500 monthly.
			</p>
			<button type="button" class="primary" onclick={() => openQuickAdd('expense')}
				>Add your first expense</button
			>
		</div>
	{:else}
		<p class="list-total">
			Regular costs: <strong class="num">{formatMoney(total)}</strong> a month
		</p>

		<SortableList
			items={active}
			label={(c) => c.name}
			onreorder={(ids) =>
				postAction('?/reorder', { ids: [...ids, ...ended.map((c) => c.id)].join(',') })}
		>
			{#snippet row(item, handle)}
				{@render costRow(item, handle)}
			{/snippet}
		</SortableList>

		{#if ended.length}
			<details class="ended">
				<summary>Ended ({ended.length})</summary>
				<ul class="ended-list">
					{#each ended as item (item.id)}
						<li class="item">
							<div class="item-main">
								<div class="item-name">{item.name}</div>
								<div class="item-meta">
									{formatMoney(currentRow(item.amounts, item.end_month!)?.amount_cents ?? 0)}
									{costFrequencyLabel[item.frequency]} · ended {monthShortLabel(item.end_month!)}
								</div>
							</div>
							<form method="post" action="?/restart" use:enhance={inPlace()}>
								<input type="hidden" name="id" value={item.id} />
								<button>Restart</button>
							</form>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>

{#snippet costRow(item: CostRow, handle: import('svelte').Snippet)}
	{@const current = currentRow(item.amounts, now)}
	<div class="item">
		{@render handle()}
		<div class="item-main">
			<div class="item-name">
				{item.name}
				{#if item.is_tax}<span class="tag brass">Tax</span>{/if}
			</div>
			<div class="item-meta">
				{#each meta(item) as bit (bit)}<span>{bit}</span>{/each}
				<button
					type="button"
					class="quiet"
					style="min-height: 2rem; padding: 0 0.3rem"
					aria-expanded={open?.id === item.id && open.mode === 'more'}
					onclick={() => toggle(item, 'more')}>Edit</button
				>
			</div>
		</div>
		<button
			type="button"
			class="item-amount num"
			aria-expanded={open?.id === item.id && open.mode === 'amount'}
			aria-label="Change amount for {item.name}, currently {formatMoney(
				current?.amount_cents ?? 0
			)}"
			onclick={() => toggle(item, 'amount')}
		>
			{formatMoney(current?.amount_cents ?? 0)}
			<small>{costFrequencyLabel[item.frequency]}</small>
		</button>

		{#if open?.id === item.id && open.mode === 'amount'}
			<div class="item-extra">
				<form method="post" action="?/amount" use:enhance={inPlace(() => (open = null))}>
					<input type="hidden" name="id" value={item.id} />
					<div class="inline-row">
						<label>New amount <MoneyInput name="amount" required bind:value={amountText} /></label>
						<label
							>Applies from
							<input type="month" name="effective_from" required value={monthInput(now)} /></label
						>
					</div>
					<p class="small muted" style="margin:0">Months before this keep the old amount.</p>
					<div class="button-row">
						<button class="primary">Save amount</button>
						<button type="button" class="quiet" onclick={() => (open = null)}>Cancel</button>
					</div>
				</form>
				<details>
					<summary>History</summary>
					<ul class="history">
						{#each newestFirst(item.amounts) as row (row.id)}
							<li>
								<span class="num"
									>{formatMoney(row.amount_cents, { exact: true })} from {monthShortLabel(
										row.effective_from
									)}</span
								>
								{#if item.amounts.length > 1}
									<form method="post" action="?/removeAmount" use:enhance={inPlace()}>
										<input type="hidden" name="id" value={item.id} />
										<input type="hidden" name="row_id" value={row.id} />
										<button class="quiet">Remove</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				</details>
			</div>
		{:else if open?.id === item.id && open.mode === 'more'}
			<div class="item-extra">
				<form method="post" action="?/update" use:enhance={inPlace(() => (open = null))}>
					<input type="hidden" name="id" value={item.id} />
					<label>Name <input name="name" required value={item.name} /></label>
					{@render frequencyFields(item)}
					<label class="check"
						><input type="checkbox" name="is_variable" checked={item.is_variable} /> Changes month to
						month</label
					>
					<label class="check"
						><input type="checkbox" name="is_tax" checked={item.is_tax} /> This is a tax payment</label
					>
					<div class="button-row"><button class="primary">Save</button></div>
				</form>
				{#if item.frequency !== 'one_time'}
					<form method="post" action="?/stop" use:enhance={inPlace(() => (open = null))}>
						<input type="hidden" name="id" value={item.id} />
						<div class="inline-row">
							<label
								>Stop after
								<input
									type="month"
									name="end_month"
									required
									value={monthInput(now)}
									min={monthInput(item.start_month)}
								/></label
							>
							<button>Stop</button>
						</div>
					</form>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet frequencyFields(item: CostRow)}
	<div class="inline-row">
		<label
			>How often
			<select name="frequency" bind:value={editFrequency}>
				{#each Object.entries(costFrequencyOption) as [value, label] (value)}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
		{#if editFrequency === 'annual'}
			<label
				>Paid in
				<select name="due_month" value={item.due_month ?? Number(item.start_month.slice(5, 7))}>
					{#each monthNames as label, i (i)}
						<option value={i + 1}>{label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>
{/snippet}
