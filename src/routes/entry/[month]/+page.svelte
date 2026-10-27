<script lang="ts">
	import { goto } from '$app/navigation';
	import { monthInput, monthLabel } from '#lib/format.ts';
	import EntryForm from './EntryForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const hasEntry = $derived(app.entries.some((e) => e.month === data.month));
</script>

<svelte:head><title>{monthLabel(data.month)} · Money</title></svelte:head>

<div class="page">
	<div class="page-head">
		<div>
			<p class="eyebrow">{hasEntry ? 'Editing' : 'New entry'}</p>
			<h1>{monthLabel(data.month)}</h1>
		</div>
		<label style="width: 11rem"
			>Month
			<input
				type="month"
				value={monthInput(data.month)}
				onchange={(e) => e.currentTarget.value && goto(`/entry/${e.currentTarget.value}`)}
			/>
		</label>
	</div>

	{#key data.month}
		<EntryForm {app} month={data.month} />
	{/key}
</div>
