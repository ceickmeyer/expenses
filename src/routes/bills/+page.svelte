<script lang="ts">
	import { enhance } from '$app/forms';
	import { billMonthly, billsPerMonth } from '#lib/budget.ts';
	import { inPlace, postAction } from '#lib/forms.ts';
	import { billFrequencyLabel, billFrequencyOption } from '#lib/format.ts';
	import { centsToInput, formatMoney } from '#lib/money.ts';
	import { openQuickAdd } from '#lib/quickadd.svelte.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';
	import SortableList from '#lib/components/SortableList.svelte';
	import type { BillRow } from '#lib/server/data.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);

	const active = $derived(app.bills.filter((b) => !b.archived));
	const stopped = $derived(app.bills.filter((b) => b.archived));
	const total = $derived(billsPerMonth(app.bills));

	let openId = $state<number | null>(null);
	let amountText = $state('');

	function toggle(bill: BillRow) {
		openId = openId === bill.id ? null : bill.id;
		amountText = centsToInput(bill.amount_cents);
	}
</script>

<svelte:head><title>Bills · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Bills</h1>
		<button type="button" class="primary" onclick={() => openQuickAdd('bill')}>+ Add bill</button>
	</div>

	{#if app.bills.length === 0}
		<div class="empty">
			<p><strong>Add the bills you pay on a schedule.</strong></p>
			<p>
				Rent, phone, insurance, subscriptions and quarterly estimated tax. They’re subtracted
				automatically, so you never enter them at check-ins. Example: Rent, $1,500 monthly.
			</p>
			<button type="button" class="primary" onclick={() => openQuickAdd('bill')}
				>Add your first bill</button
			>
		</div>
	{:else}
		<p class="list-total">Bills: <strong class="num">{formatMoney(total)}</strong> a month</p>

		<SortableList
			items={active}
			label={(b) => b.name}
			onreorder={(ids) =>
				postAction('?/reorder', { ids: [...ids, ...stopped.map((b) => b.id)].join(',') })}
		>
			{#snippet row(bill, handle)}
				{@render billRow(bill, handle)}
			{/snippet}
		</SortableList>

		{#if stopped.length}
			<details class="ended">
				<summary>Stopped ({stopped.length})</summary>
				<ul class="ended-list">
					{#each stopped as bill (bill.id)}
						<li class="item">
							<div class="item-main">
								<div class="item-name">{bill.name}</div>
								<div class="item-meta">
									{formatMoney(bill.amount_cents)}
									{billFrequencyLabel[bill.frequency]}
								</div>
							</div>
							<form method="post" action="?/restore" use:enhance={inPlace()}>
								<input type="hidden" name="id" value={bill.id} />
								<button>Restart</button>
							</form>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>

{#snippet billRow(bill: BillRow, handle: import('svelte').Snippet)}
	<div class="item">
		{@render handle()}
		<div class="item-main">
			<div class="item-name">
				{bill.name}
				{#if bill.is_tax}<span class="tag brass">Tax</span>{/if}
			</div>
			<div class="item-meta">
				{billFrequencyOption[bill.frequency]}
				{#if bill.frequency !== 'monthly'}
					<span>· {formatMoney(billMonthly(bill))} a month</span>
				{/if}
			</div>
		</div>
		<button
			type="button"
			class="item-amount num"
			aria-expanded={openId === bill.id}
			aria-label="Edit {bill.name}, {formatMoney(bill.amount_cents)} {billFrequencyLabel[
				bill.frequency
			]}"
			onclick={() => toggle(bill)}
		>
			{formatMoney(bill.amount_cents)}
			<small>{billFrequencyLabel[bill.frequency]}</small>
		</button>

		{#if openId === bill.id}
			<div class="item-extra">
				<form method="post" action="?/update" use:enhance={inPlace(() => (openId = null))}>
					<input type="hidden" name="id" value={bill.id} />
					<label>Name <input name="name" required value={bill.name} /></label>
					<div class="inline-row">
						<label>Amount <MoneyInput name="amount" required bind:value={amountText} /></label>
						<label
							>How often
							<select name="frequency" value={bill.frequency}>
								{#each Object.entries(billFrequencyOption) as [value, label] (value)}
									<option {value}>{label}</option>
								{/each}
							</select>
						</label>
					</div>
					<label class="check"
						><input type="checkbox" name="is_tax" checked={bill.is_tax} /> This is an estimated tax payment</label
					>
					<div class="button-row">
						<button class="primary">Save</button>
						<button type="button" class="quiet" onclick={() => (openId = null)}>Cancel</button>
					</div>
				</form>
				<form method="post" action="?/archive" use:enhance={inPlace(() => (openId = null))}>
					<input type="hidden" name="id" value={bill.id} />
					<button>Stop this bill</button>
				</form>
			</div>
		{/if}
	</div>
{/snippet}
