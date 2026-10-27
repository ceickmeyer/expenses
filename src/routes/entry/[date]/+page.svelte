<script lang="ts">
	import { goto } from '$app/navigation';
	import { dayLabel, today } from '#lib/format.ts';
	import EntryForm from './EntryForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const hasEntry = $derived(app.entries.some((e) => e.date === data.date));
</script>

<svelte:head><title>Entry {data.date} · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">
				{hasEntry ? 'Editing entry' : data.date === today() ? 'New entry' : 'New back-dated entry'}
			</p>
			<h1>{dayLabel(data.date)}</h1>
		</div>
		<label style="width: 11rem"
			>Date
			<input
				type="date"
				value={data.date}
				max={today()}
				onchange={(e) => e.currentTarget.value && goto(`/entry/${e.currentTarget.value}`)}
			/>
		</label>
	</div>

	{#key data.date}
		<EntryForm {app} date={data.date} />
	{/key}
</div>
