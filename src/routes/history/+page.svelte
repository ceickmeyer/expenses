<script lang="ts">
	import { goto } from '$app/navigation';
	import { periods, sortedCheckins } from '#lib/budget.ts';
	import { dayMediumLabel, periodLabel } from '#lib/format.ts';
	import { formatMoney, formatSigned } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);

	const byEnd = $derived(new Map(periods(app).map((p) => [p.end, p])));
	const rows = $derived(
		sortedCheckins(app.checkins)
			.reverse()
			.map((c) => ({ checkin: c, period: byEnd.get(c.date) ?? null }))
	);
</script>

<svelte:head><title>History · Money</title></svelte:head>

<div class="page wide">
	<div class="page-head">
		<h1>History</h1>
		<a class="button" href="/checkin">Check in</a>
	</div>

	{#if rows.length === 0}
		<div class="empty">
			<p><strong>Every check-in shows up here.</strong></p>
			<p>
				Each row covers the time since the check-in before: how much your balances grew, your
				main-job pay, bills, and everything else. Example: Sep 27 – Oct 27 — grew $1,200.
			</p>
			<a class="button primary" href="/checkin">Check in now</a>
		</div>
	{:else}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Check-in</th>
						<th scope="col">Grew</th>
						<th scope="col">Main job</th>
						<th scope="col">Bills</th>
						<th scope="col">Everything else</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as { checkin, period } (checkin.date)}
						<tr onclick={() => goto(`/checkin/${checkin.date}`)}>
							<th scope="row">
								<a href="/checkin/{checkin.date}">{dayMediumLabel(checkin.date)}</a>
								<span class="sub"
									>{period
										? `${periodLabel(period.start, period.end)} · ${period.days} days`
										: 'First check-in'}</span
								>
							</th>
							<td class="num">{period ? formatSigned(period.growth) : '—'}</td>
							<td class="num">{formatMoney(checkin.main_income_cents)}</td>
							<td class="num">{period ? `−${formatMoney(period.bills)}` : '—'}</td>
							<td class="num">{period ? formatSigned(period.other) : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="small muted">
			Everything else = grew − main job + bills: side income minus day-to-day spending.
		</p>
	{/if}
</div>

<style>
	.wide {
		max-width: 60rem;
	}
	.scroll {
		overflow-x: auto;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		margin-bottom: 0.75rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 36rem;
	}
	th,
	td {
		padding: 0.65rem 0.8rem;
		text-align: right;
		border-bottom: 1px solid var(--line);
	}
	thead th {
		font-size: var(--step--1);
		font-weight: 500;
		color: var(--muted);
	}
	th:first-child {
		text-align: left;
		position: sticky;
		left: 0;
		background: var(--surface);
	}
	tbody th {
		font-weight: 500;
	}
	.sub {
		display: block;
		font-size: var(--step--2);
		font-weight: 400;
		color: var(--muted);
	}
	tbody tr {
		cursor: pointer;
	}
	tbody tr:hover,
	tbody tr:hover th {
		background: var(--sunken);
	}
	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: none;
	}
</style>
