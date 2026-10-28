<script lang="ts">
	import { enhance } from '$app/forms';
	import { inPlace } from '#lib/forms.ts';
	import { quickAdd, type QuickAddTab } from '#lib/quickadd.svelte.ts';
	import { accountTypeLabel, billFrequencyOption, countsByDefault } from '#lib/format.ts';
	import MoneyInput from './MoneyInput.svelte';

	let dialog: HTMLDialogElement | undefined = $state();
	let firstField: HTMLInputElement | undefined = $state();

	const tabs: { id: QuickAddTab; label: string }[] = [
		{ id: 'bill', label: 'Bill' },
		{ id: 'account', label: 'Account' }
	];

	let amount = $state('');
	let accountType = $state<keyof typeof accountTypeLabel>('checking');
	let counts = $state(true);

	$effect(() => {
		if (!dialog) return;
		if (quickAdd.open && !dialog.open) {
			dialog.showModal();
			queueMicrotask(() => firstField?.focus());
		} else if (!quickAdd.open && dialog.open) {
			dialog.close();
		}
	});

	function close() {
		quickAdd.open = false;
	}

	// Bumped after a save so the forms re-render empty.
	let resetKey = $state(0);

	function saved() {
		resetKey++;
		amount = '';
		accountType = 'checking';
		counts = true;
		close();
	}
</script>

<dialog bind:this={dialog} onclose={close} aria-labelledby="quick-add-title" class="sheet">
	<header>
		<h2 id="quick-add-title">Add</h2>
		<button type="button" class="icon" onclick={close} aria-label="Close">✕</button>
	</header>

	<div class="tabs" role="tablist">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={quickAdd.tab === tab.id}
				class:active={quickAdd.tab === tab.id}
				onclick={() => (quickAdd.tab = tab.id)}>{tab.label}</button
			>
		{/each}
	</div>

	{#key resetKey}
		{#if quickAdd.tab === 'bill'}
			<form method="post" action="/quick?/bill" use:enhance={inPlace(saved)}>
				<label>Name <input name="name" required placeholder="Rent" bind:this={firstField} /></label>
				<div class="row">
					<label>Amount <MoneyInput name="amount" required bind:value={amount} /></label>
					<label
						>How often
						<select name="frequency">
							{#each Object.entries(billFrequencyOption) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</label>
				</div>
				<label class="check"
					><input type="checkbox" name="is_tax" /> This is an estimated tax payment</label
				>
				<button class="primary">Add bill</button>
			</form>
		{:else}
			<form method="post" action="/quick?/account" use:enhance={inPlace(saved)}>
				<label
					>Name <input name="name" required placeholder="Checking" bind:this={firstField} /></label
				>
				<label
					>Type
					<select
						name="type"
						bind:value={accountType}
						onchange={() => (counts = countsByDefault(accountType))}
					>
						{#each Object.entries(accountTypeLabel) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="check"
					><input type="checkbox" name="counts_toward_spending" bind:checked={counts} /> Counts toward
					growth</label
				>
				<p class="hint">
					Leave this off for accounts that move on their own, like investments, or that only hold
					money set aside, like a tax reserve.
				</p>
				<button class="primary">Add account</button>
			</form>
		{/if}
	{/key}
</dialog>

<style>
	.sheet {
		width: min(100%, 30rem);
		max-height: 92dvh;
		margin: auto auto 0;
		border: none;
		border-radius: var(--radius) var(--radius) 0 0;
		padding: 1rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	@media (min-width: 40rem) {
		.sheet {
			margin: auto;
			border-radius: var(--radius);
		}
	}
	.sheet::backdrop {
		background: color-mix(in srgb, var(--ink) 35%, transparent);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		margin: 0;
		font-size: var(--step-1);
	}
	.tabs {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.25rem;
		margin: 0.75rem 0 1rem;
		padding: 0.25rem;
		background: var(--sunken);
		border-radius: var(--radius-sm);
	}
	.tabs button {
		border: none;
		background: transparent;
		padding: 0.5rem;
		border-radius: calc(var(--radius-sm) - 2px);
		color: var(--muted);
	}
	.tabs button.active {
		background: var(--surface);
		color: var(--ink);
		font-weight: 600;
		box-shadow: var(--shadow-sm);
	}
	form {
		display: grid;
		gap: 0.85rem;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
	.hint {
		margin: 0;
		font-size: var(--step--1);
		color: var(--muted);
	}
	.primary {
		margin-top: 0.25rem;
	}
</style>
