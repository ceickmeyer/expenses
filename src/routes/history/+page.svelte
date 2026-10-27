<script lang="ts">
	import { goto } from '$app/navigation';
	import { entryCosts, entryIncome, reconcile } from '#lib/budget.ts';
	import { monthInput, monthLabel } from '#lib/format.ts';
	import { formatMoney, formatSigned } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);

	const rows = $derived(
		[...app.entries].reverse().map((entry) => {
			const rec = reconcile(app, entry.month);
			return {
				month: entry.month,
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
		<a class="button" href="/entry">Enter a month</a>
	</div>

	{#if rows.length === 0}
		<div class="empty">
			<p><strong>Every month you enter shows up here.</strong></p>
			<p>
				Income, costs, spending and how your balances moved. Example: September — $10,500 in, $3,250
				out.
			</p>
			<a class="button primary" href="/entry">Enter your first month</a>
		</div>
	{:else}
		<div class="scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">Month</th>
						<th scope="col">Income</th>
						<th scope="col">Costs</th>
						<th scope="col">Spending</th>
						<th scope="col">Balances</th>
						<th scope="col">Unaccounted</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.month)}
						<tr onclick={() => goto(`/entry/${monthInput(r.month)}`)}>
							<th scope="row"><a href="/entry/{monthInput(r.month)}">{monthLabel(r.month)}</a></th>
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
		min-width: 38rem;
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
