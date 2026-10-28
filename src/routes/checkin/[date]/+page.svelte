<script lang="ts">
	import { goto } from '$app/navigation';
	import { dayLabel, today } from '#lib/format.ts';
	import CheckinForm from './CheckinForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const existing = $derived(app.checkins.some((c) => c.date === data.date));
</script>

<svelte:head><title>Check in · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">{existing ? 'Editing check-in' : 'New check-in'}</p>
			<h1>{dayLabel(data.date)}</h1>
		</div>
		<label style="width: 11rem"
			>Date
			<input
				type="date"
				value={data.date}
				max={today()}
				onchange={(e) => e.currentTarget.value && goto(`/checkin/${e.currentTarget.value}`)}
			/>
		</label>
	</div>

	{#key data.date}
		<CheckinForm {app} date={data.date} />
	{/key}
</div>
