<script lang="ts">
	import { enhance } from '$app/forms';
	import { accountBalances, totalSpendable } from '#lib/budget.ts';
	import { inPlace, postAction } from '#lib/forms.ts';
	import { accountTypeLabel, dayMediumLabel } from '#lib/format.ts';
	import { formatMoney, formatSigned } from '#lib/money.ts';
	import { openQuickAdd } from '#lib/quickadd.svelte.ts';
	import SortableList from '#lib/components/SortableList.svelte';
	import type { AccountRow } from '#lib/server/data.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);

	const active = $derived(app.accounts.filter((a) => !a.archived));
	const archived = $derived(app.accounts.filter((a) => a.archived));
	const balances = $derived(
		new Map(accountBalances(app.accounts, app.snapshots).map((b) => [b.account.id, b]))
	);
	const spendable = $derived(totalSpendable([...balances.values()]));

	let openId = $state<number | null>(null);
</script>

<svelte:head><title>Accounts · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<h1>Accounts</h1>
		<button type="button" class="primary" onclick={() => openQuickAdd('account')}
			>+ Add account</button
		>
	</div>

	{#if app.accounts.length === 0}
		<div class="empty">
			<p><strong>Add each account whose balance you want to track.</strong></p>
			<p>
				Checking counts toward spending money; a tax reserve and investments don’t. Enter credit
				cards too — their balances are entered as negative. Example: Checking, counts toward
				spending.
			</p>
			<button type="button" class="primary" onclick={() => openQuickAdd('account')}
				>Add your first account</button
			>
		</div>
	{:else}
		<p class="list-total">Spendable now: <strong class="num">{formatMoney(spendable)}</strong></p>

		<SortableList
			items={active}
			label={(a) => a.name}
			onreorder={(ids) =>
				postAction('?/reorder', { ids: [...ids, ...archived.map((a) => a.id)].join(',') })}
		>
			{#snippet row(item, handle)}
				{@render accountRow(item, handle)}
			{/snippet}
		</SortableList>
		<p class="small muted" style="margin-top: 0.75rem">
			Balances are updated whenever you make an entry.
		</p>

		{#if archived.length}
			<details class="ended">
				<summary>Archived ({archived.length})</summary>
				<ul class="ended-list">
					{#each archived as item (item.id)}
						<li class="item">
							<div class="item-main">
								<div class="item-name">{item.name}</div>
								<div class="item-meta">{accountTypeLabel[item.type]}</div>
							</div>
							<form method="post" action="?/restore" use:enhance={inPlace()}>
								<input type="hidden" name="id" value={item.id} />
								<button>Restore</button>
							</form>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>

{#snippet accountRow(item: AccountRow, handle: import('svelte').Snippet)}
	{@const b = balances.get(item.id)}
	<div class="item">
		{@render handle()}
		<div class="item-main">
			<div class="item-name">{item.name}</div>
			<div class="item-meta">
				<span>{accountTypeLabel[item.type]}</span>
				{#if item.counts_toward_spending}<span class="tag moss">Spending</span>{/if}
				<button
					type="button"
					class="quiet"
					style="min-height: 2rem; padding: 0 0.3rem"
					aria-expanded={openId === item.id}
					onclick={() => (openId = openId === item.id ? null : item.id)}>Edit</button
				>
			</div>
		</div>
		<div class="item-amount num" style="text-decoration: none">
			{b?.balance == null ? '—' : formatMoney(b.balance)}
			<small>
				{#if b?.asOf}{dayMediumLabel(b.asOf)}{#if b.change != null}
						· {formatSigned(b.change)}{/if}{:else}No balance yet{/if}
			</small>
		</div>

		{#if openId === item.id}
			<div class="item-extra">
				<form method="post" action="?/update" use:enhance={inPlace(() => (openId = null))}>
					<input type="hidden" name="id" value={item.id} />
					<label>Name <input name="name" required value={item.name} /></label>
					<label
						>Type
						<select name="type" value={item.type}>
							{#each Object.entries(accountTypeLabel) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</label>
					<label class="check"
						><input
							type="checkbox"
							name="counts_toward_spending"
							checked={item.counts_toward_spending}
						/> Counts toward spending money</label
					>
					<div class="button-row">
						<button class="primary">Save</button>
					</div>
				</form>
				<form method="post" action="?/archive" use:enhance={inPlace(() => (openId = null))}>
					<input type="hidden" name="id" value={item.id} />
					<button>Archive account</button>
					<p class="small muted" style="margin: 0.4rem 0 0">
						Archived accounts keep their history but leave the entry form.
					</p>
				</form>
			</div>
		{/if}
	</div>
{/snippet}
