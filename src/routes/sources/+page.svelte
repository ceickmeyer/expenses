<script lang="ts">
	import { enhance } from '$app/forms';
	import { monthlyIncomeTotal } from '#lib/budget.ts';
	import { inPlace, postAction } from '#lib/forms.ts';
	import {
		categoryLabel,
		incomeFrequencyLabel,
		monthInput,
		monthShortLabel,
		thisMonth
	} from '#lib/format.ts';
	import { currentRow, isEnded, newestFirst } from '#lib/items.ts';
	import { centsToInput, formatMoney } from '#lib/money.ts';
	import { openQuickAdd } from '#lib/quickadd.svelte.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';
	import SortableList from '#lib/components/SortableList.svelte';
	import type { RateRow, SourceRow } from '#lib/server/data.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const now = thisMonth();

	const active = $derived(app.sources.filter((s) => !isEnded(s, now)));
	const ended = $derived(app.sources.filter((s) => isEnded(s, now)));
	const total = $derived(monthlyIncomeTotal(app.sources, now));

	let open = $state<{ id: number; mode: 'rate' | 'more' } | null>(null);
	let rateText = $state('');

	function toggle(item: SourceRow, mode: 'rate' | 'more') {
		if (open?.id === item.id && open.mode === mode) {
			open = null;
			return;
		}
		open = { id: item.id, mode };
		if (mode === 'rate') rateText = centsToInput(currentRow(item.rates, now)?.rate_cents);
	}

	function describe(rate: RateRow | undefined): string {
		if (!rate) return '';
		const summer =
			rate.summer_quantity === 0 ? 'none in summer' : `${rate.summer_quantity} in summer`;
		return `${rate.quantity} ${rate.quantity === 1 ? 'client' : 'clients'} · ${summer}`;
	}
</script>

<svelte:head><title>Income · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Income</h1>
		<button type="button" class="primary" onclick={() => openQuickAdd('income')}
			>+ Add income</button
		>
	</div>

	{#if app.sources.length === 0}
		<div class="empty">
			<p><strong>Add each client or group of students you bill.</strong></p>
			<p>
				Group clients who pay the same rate on the same schedule. Example: 10 weekly students at
				$90.
			</p>
			<button type="button" class="primary" onclick={() => openQuickAdd('income')}
				>Add your first income</button
			>
		</div>
	{:else}
		<p class="list-total">
			Regular income: <strong class="num">{formatMoney(total)}</strong> a month on a full schedule
		</p>

		<SortableList
			items={active}
			label={(s) => s.name}
			onreorder={(ids) =>
				postAction('?/reorder', { ids: [...ids, ...ended.map((s) => s.id)].join(',') })}
		>
			{#snippet row(item, handle)}
				{@render sourceRow(item, handle)}
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
									{categoryLabel[item.category]} · ended {monthShortLabel(item.end_month!)}
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

{#snippet sourceRow(item: SourceRow, handle: import('svelte').Snippet)}
	{@const current = currentRow(item.rates, now)}
	<div class="item">
		{@render handle()}
		<div class="item-main">
			<div class="item-name">
				{item.name}
				<span
					class="tag"
					class:moss={item.category === 'tutoring'}
					class:brass={item.category === 'dog_walking'}>{categoryLabel[item.category]}</span
				>
			</div>
			<div class="item-meta">
				<span>{describe(current)}</span>
				{#if item.start_month > now}<span>Starts {monthShortLabel(item.start_month)}</span>{/if}
				{#if item.end_month}<span>Last month {monthShortLabel(item.end_month)}</span>{/if}
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
			aria-expanded={open?.id === item.id && open.mode === 'rate'}
			aria-label="Change rate for {item.name}, currently {formatMoney(current?.rate_cents ?? 0)}"
			onclick={() => toggle(item, 'rate')}
		>
			{formatMoney(current?.rate_cents ?? 0)}
			<small>{incomeFrequencyLabel[item.frequency]}</small>
		</button>

		{#if open?.id === item.id && open.mode === 'rate'}
			<div class="item-extra">
				<form method="post" action="?/rate" use:enhance={inPlace(() => (open = null))}>
					<input type="hidden" name="id" value={item.id} />
					<div class="inline-row">
						<label>Rate <MoneyInput name="rate" required bind:value={rateText} /></label>
						<label
							>Clients <input
								type="number"
								name="quantity"
								min="0"
								required
								value={current?.quantity ?? 1}
							/></label
						>
						<label
							>In summer
							<input
								type="number"
								name="summer_quantity"
								min="0"
								required
								value={current?.summer_quantity ?? 0}
							/></label
						>
						<label
							>Applies from
							<input type="month" name="effective_from" required value={monthInput(now)} /></label
						>
					</div>
					<p class="small muted" style="margin:0">Months before this keep the old rate.</p>
					<div class="button-row">
						<button class="primary">Save rate</button>
						<button type="button" class="quiet" onclick={() => (open = null)}>Cancel</button>
					</div>
				</form>
				<details>
					<summary>History</summary>
					<ul class="history">
						{#each newestFirst(item.rates) as row (row.id)}
							<li>
								<span class="num"
									>{formatMoney(row.rate_cents, { exact: true })} × {row.quantity} from {monthShortLabel(
										row.effective_from
									)}</span
								>
								{#if item.rates.length > 1}
									<form method="post" action="?/removeRate" use:enhance={inPlace()}>
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
					<div class="inline-row">
						<label
							>Category
							<select name="category" value={item.category}>
								{#each Object.entries(categoryLabel) as [value, label] (value)}
									<option {value}>{label}</option>
								{/each}
							</select>
						</label>
						<label
							>How often
							<select name="frequency" value={item.frequency}>
								<option value="weekly">Weekly</option>
								<option value="biweekly">Every 2 weeks</option>
								<option value="monthly">Monthly</option>
							</select>
						</label>
					</div>
					<div class="button-row"><button class="primary">Save</button></div>
				</form>
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
			</div>
		{/if}
	</div>
{/snippet}
