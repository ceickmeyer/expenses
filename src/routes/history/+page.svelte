<script lang="ts">
	import { goto } from '$app/navigation';
	import { entryCosts, entryIncome, entryPeriod, reconcile } from '#lib/budget.ts';
	import { dayMediumLabel, periodLabel } from '#lib/format.ts';
	import { formatMoney, formatSigned } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);

	const rows = $derived(
		[...app.entries].reverse().map((entry) => {
			const rec = reconcile(app, entry.date);
			const period = entryPeriod(app.entries, entry.date);
			return {
				date: entry.date,
				period,
				income: entryIncome(entry),
				costs: entryCosts(entry),
				spent: entry.discretionary_spent_cents ?? rec?.implied ?? null,
				implied: entry.discretionary_spent_cents === null && rec?.implied != null,
				change: rec?.actualChange ?? null,
				unaccounted: rec?.unaccounted ?? null
			};
		})
	);
</script>

<svelte:head><title>History · Money</title></svelte:head>

<div class="page wide">
	<div class="page-head">
		<h1>History</h1>
		<a class="button" href="/entry">New entry</a>
	</div>

	{#if rows.length === 0}
		<div class="empty">
			<p><strong>Every entry you make shows up here.</strong></p>
			<p>
				Each one covers the days since the one before: what came in, what went out, and how your
				balances moved. Example: Oct 13 – 27 — $5,850 in, $1,565 out.
			</p>
			<a class="button primary" href="/entry">Make your first entry</a>
		</div>
	{:else}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Entry</th>
						<th scope="col">Income</th>
						<th scope="col">Costs</th>
						<th scope="col">Spending</th>
						<th scope="col">Balances</th>
						<th scope="col">Unaccounted</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.date)}
						<tr onclick={() => goto(`/entry/${r.date}`)}>
							<th scope="row">
								<a href="/entry/{r.date}">{dayMediumLabel(r.date)}</a>
								<span class="period"
									>{periodLabel(r.period.start, r.period.end)} · {r.period.days}
									{r.period.days === 1 ? 'day' : 'days'}</span
								>
							</th>
							<td class="num">{formatMoney(r.income)}</td>
							<td class="num">{formatMoney(r.costs)}</td>
							<td class="num">
								{r.spent === null ? '—' : formatMoney(r.spent)}{#if r.implied}<span
										class="muted"
										title="Worked out from balances"
									>
										*</span
									>{/if}
							</td>
							<td class="num">{r.change === null ? '—' : formatSigned(r.change)}</td>
							<td class="num">{r.unaccounted === null ? '—' : formatSigned(r.unaccounted)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="small muted">* Worked out from balance changes because spending was left blank.</p>
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
		min-width: 40rem;
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
	.period {
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
