<script lang="ts">
	import { enhance } from '$app/forms';
	import { inPlace } from '#lib/forms.ts';
	import { quickAdd, type QuickAddTab } from '#lib/quickadd.svelte.ts';
	import {
		accountTypeLabel,
		categoryLabel,
		costFrequencyOption,
		monthInput,
		monthNames,
		thisMonth
	} from '#lib/format.ts';
	import MoneyInput from './MoneyInput.svelte';

	let dialog: HTMLDialogElement | undefined = $state();
	let firstField: HTMLInputElement | undefined = $state();

	const tabs: { id: QuickAddTab; label: string }[] = [
		{ id: 'expense', label: 'Expense' },
		{ id: 'income', label: 'Income' },
		{ id: 'account', label: 'Account' }
	];

	// Field state survives tab switches but resets after a successful save.
	let costFrequency = $state<keyof typeof costFrequencyOption>('monthly');
	let costStart = $state(monthInput(thisMonth()));
	let accountType = $state<keyof typeof accountTypeLabel>('checking');
	let countsTowardSpending = $state(true);
	let amount = $state('');
	let rate = $state('');

	$effect(() => {
		if (!dialog) return;
		if (quickAdd.open && !dialog.open) {
			costStart = monthInput(thisMonth());
			dialog.showModal();
			queueMicrotask(() => firstField?.focus());
		} else if (!quickAdd.open && dialog.open) {
			dialog.close();
		}
	});

	$effect(() => {
		// Default "counts toward spending" to what the account type usually means.
		countsTowardSpending = accountType === 'checking' || accountType === 'credit_card';
	});

	function close() {
		quickAdd.open = false;
	}

	// Bumped after a save so the forms re-render empty.
	let resetKey = $state(0);

	function saved() {
		resetKey++;
		amount = '';
		rate = '';
		costFrequency = 'monthly';
		accountType = 'checking';
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
		{#if quickAdd.tab === 'expense'}
			<form method="post" action="/quick?/expense" use:enhance={inPlace(saved)}>
				<label>Name <input name="name" required placeholder="Phone" bind:this={firstField} /></label
				>
				<div class="row">
					<label>Amount <MoneyInput name="amount" required bind:value={amount} /></label>
					<label
						>How often
						<select name="frequency" bind:value={costFrequency}>
							{#each Object.entries(costFrequencyOption) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</label>
				</div>
				<div class="row">
					<label
						>{costFrequency === 'one_time' ? 'Month paid' : 'Starting month'}
						<input type="month" name="start_month" required bind:value={costStart} /></label
					>
					{#if costFrequency === 'annual'}
						<label
							>Paid in
							<select name="due_month" value={Number(costStart.slice(5, 7))}>
								{#each monthNames as label, i (i)}
									<option value={i + 1}>{label}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>
				<label class="check"
					><input type="checkbox" name="is_variable" /> Changes month to month</label
				>
				<label class="check"><input type="checkbox" name="is_tax" /> This is a tax payment</label>
				<button class="primary">Add expense</button>
			</form>
		{:else if quickAdd.tab === 'income'}
			<form method="post" action="/quick?/income" use:enhance={inPlace(saved)}>
				<label
					>Name <input
						name="name"
						required
						placeholder="Weekly students"
						bind:this={firstField}
					/></label
				>
				<div class="row">
					<label
						>Category
						<select name="category">
							{#each Object.entries(categoryLabel) as [value, label] (value)}
								<option {value}>{label}</option>
							{/each}
						</select>
					</label>
					<label
						>How often
						<select name="frequency">
							<option value="weekly">Weekly</option>
							<option value="biweekly">Every 2 weeks</option>
							<option value="monthly">Monthly</option>
						</select>
					</label>
				</div>
				<div class="row">
					<label>Rate <MoneyInput name="rate" required bind:value={rate} placeholder="90" /></label>
					<label>Clients <input type="number" name="quantity" min="0" value="1" required /></label>
				</div>
				<div class="row">
					<label
						>Continue in summer
						<input type="number" name="summer_quantity" min="0" value="0" required /></label
					>
					<label
						>Starting month
						<input
							type="month"
							name="start_month"
							required
							value={monthInput(thisMonth())}
						/></label
					>
				</div>
				<p class="hint">
					Rate is per session (or per payment). Summer tutoring is set in Settings.
				</p>
				<button class="primary">Add income</button>
			</form>
		{:else}
			<form method="post" action="/quick?/account" use:enhance={inPlace(saved)}>
				<label
					>Name <input name="name" required placeholder="Checking" bind:this={firstField} /></label
				>
				<label
					>Type
					<select name="type" bind:value={accountType}>
						{#each Object.entries(accountTypeLabel) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="check"
					><input
						type="checkbox"
						name="counts_toward_spending"
						bind:checked={countsTowardSpending}
					/> Counts toward spending money</label
				>
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
		grid-template-columns: repeat(3, 1fr);
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
