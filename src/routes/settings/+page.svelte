<script lang="ts">
	import { enhance } from '$app/forms';
	import { inPlace } from '#lib/forms.ts';
	import { EXPORTS } from '#lib/exports.ts';
	import { monthNames } from '#lib/format.ts';
	import { centsToInput } from '#lib/money.ts';
	import MoneyInput from '#lib/components/MoneyInput.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = $derived(data.app!.settings);

	/* svelte-ignore state_referenced_locally */
	let summerRate = $state(centsToInput(data.app!.settings.summer_tutoring_rate_cents));
	/* svelte-ignore state_referenced_locally */
	let savingsGoal = $state(centsToInput(data.app!.settings.monthly_savings_goal_cents));
</script>

<svelte:head><title>Settings · Money</title></svelte:head>

<div class="page">
	<h1>Settings</h1>

	<form method="post" use:enhance={inPlace()}>
		<section class="panel">
			<h2>Cancellations</h2>
			<p class="small muted">Sessions or walks that usually don’t happen in a typical week.</p>
			<div class="inline-row">
				<label
					>Tutoring per week
					<input
						type="number"
						name="tutoring_cancellations_per_week"
						min="0"
						step="0.1"
						value={s.tutoring_cancellations_per_week}
					/></label
				>
				<label
					>Dog walks per week
					<input
						type="number"
						name="dog_cancellations_per_week"
						min="0"
						step="0.1"
						value={s.dog_cancellations_per_week}
					/></label
				>
			</div>
		</section>

		<section class="panel">
			<h2>Summer tutoring</h2>
			<p class="small muted">During reduced weeks, regular tutoring is replaced by these hours.</p>
			<div class="inline-row">
				<label
					>Hours per week
					<input
						type="number"
						name="summer_tutoring_hours_per_week"
						min="0"
						step="0.5"
						value={s.summer_tutoring_hours_per_week}
					/></label
				>
				<label
					>Rate per hour <MoneyInput name="summer_tutoring_rate" bind:value={summerRate} /></label
				>
			</div>
		</section>

		<section class="panel">
			<h2>Reduced weeks</h2>
			<p class="small muted">
				How many weeks of each month run on the summer or holiday schedule. Halves are fine.
			</p>
			<div class="months">
				{#each monthNames as label, i (i)}
					{@const key = String(i + 1).padStart(2, '0')}
					<label
						>{label}
						<input
							type="number"
							name="reduced_{key}"
							min="0"
							max="5"
							step="0.1"
							value={s.reduced_weeks_by_month[key] ?? 0}
						/></label
					>
				{/each}
			</div>
		</section>

		<section class="panel">
			<h2>Savings goal</h2>
			<p class="small muted">Set aside each month before working out what you can spend.</p>
			<label style="max-width: 14rem"
				>Per month <MoneyInput name="monthly_savings_goal" bind:value={savingsGoal} /></label
			>
		</section>

		<button class="primary save">Save settings</button>
	</form>

	<section class="panel export">
		<h2>Export</h2>
		<p class="small muted">Download your data as CSV files, one per table.</p>
		<ul>
			{#each Object.entries(EXPORTS) as [name, { label }] (name)}
				<li><a href="/settings/export/{name}" download>{label}</a></li>
			{/each}
		</ul>
	</section>
</div>

<style>
	h2 {
		font-size: var(--step-1);
		margin-bottom: 0.25rem;
	}
	.months {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
		gap: 0.6rem;
	}
	.save {
		width: 100%;
		margin-bottom: 1.5rem;
	}
	.export ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.25rem;
	}
	.export a {
		display: inline-block;
		padding: 0.3rem 0;
	}
</style>
