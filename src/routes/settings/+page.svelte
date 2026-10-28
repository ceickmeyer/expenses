<script lang="ts">
	import { enhance } from '$app/forms';
	import { inPlace } from '#lib/forms.ts';
	import { centsToInput } from '#lib/money.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/* svelte-ignore state_referenced_locally */
	let savingsGoal = $state(centsToInput(data.app!.settings.monthly_savings_goal_cents));
</script>

<svelte:head><title>Settings · Money</title></svelte:head>

<div class="page">
	<h1>Settings</h1>

	<form method="post" use:enhance={inPlace()}>
		<section class="panel">
			<h2>Savings goal</h2>
			<p class="small muted">
				How much you want your balances to grow each month. Growth beyond this is extra room to
				spend; growth below it means cutting back.
			</p>
			<label style="max-width: 14rem"
				>Per month <MoneyInput name="monthly_savings_goal" bind:value={savingsGoal} /></label
			>
		</section>
		<button class="primary save">Save</button>
	</form>
</div>

<style>
	h2 {
		font-size: var(--step-1);
		margin-bottom: 0.25rem;
	}
	.save {
		width: 100%;
	}
</style>
