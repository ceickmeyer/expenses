<script lang="ts">
	import {
		accountBalances,
		addMonths,
		averageSpendingDifference,
		dayIn,
		daysBetween,
		monthFigures,
		projection,
		reservePlan,
		savingsTotal,
		setAside,
		spendingFor,
		taxStatus,
		totalSpendable
	} from '#lib/budget.ts';
	import CashFlowChart from '#lib/components/CashFlowChart.svelte';
	import {
		dateLabel,
		dayShortLabel,
		monthLabel,
		monthShortLabel,
		periodLabel,
		thisMonth,
		today as todayDay
	} from '#lib/format.ts';
	import { formatAbs, formatMoney, formatSigned } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const today = new Date();
	const now = thisMonth();

	const checklist = $derived([
		{ label: 'Add your accounts', href: '/accounts', done: app.accounts.length > 0 },
		{ label: 'Add your income sources', href: '/sources', done: app.sources.length > 0 },
		{ label: 'Add your regular costs', href: '/costs', done: app.costs.length > 0 },
		{
			label: 'Set your schedule (cancellations, summer hours, reduced weeks)',
			href: '/settings',
			done: app.settings.configured,
			optional: true
		},
		{ label: 'Make your first entry', href: '/entry', done: app.entries.length > 0 }
	]);
	const setupDone = $derived(checklist.slice(0, 3).every((c) => c.done));
	const latestEntry = $derived(app.entries.at(-1)?.date ?? null);

	const p = $derived(projection(app, today));

	// This month: actuals up to the latest entry, expected for the rest.
	const focus = now;
	const focusFigures = $derived(monthFigures(app, focus));
	const focusSetAside = $derived(setAside(focusFigures, p.perMonth, app.settings));

	const spending = $derived(latestEntry ? spendingFor(app, latestEntry, p.perDay) : null);
	const spendingAvg = $derived(
		latestEntry ? averageSpendingDifference(app, latestEntry, p.perDay) : null
	);
	const daysSinceEntry = $derived(latestEntry ? daysBetween(latestEntry, todayDay()) : null);

	const chartMonths = $derived(
		p.months.map((f) => ({
			month: f.month,
			income: f.income,
			costs: f.setAsideCosts,
			actual: f.actual
		}))
	);

	const balances = $derived(accountBalances(app.accounts, app.snapshots));
	const spendable = $derived(totalSpendable(balances));
	const tax = $derived(taxStatus(app, today));
	const hasTax = $derived(app.costs.some((c) => c.is_tax && c.frequency === 'quarterly'));
	const hasTaxAccount = $derived(app.accounts.some((a) => a.type === 'tax_reserve' && !a.archived));

	const reserve = $derived(reservePlan(app, now, p.perMonth));
	const savings = $derived(savingsTotal(balances));
	const reservePct = $derived(
		reserve.target > 0 ? Math.min(100, Math.max(0, (savings / reserve.target) * 100)) : 100
	);
</script>

<svelte:head><title>Money</title></svelte:head>

<div class="page">
	{#if !setupDone}
		<section class="panel setup">
			<p class="eyebrow">Getting started</p>
			<h1>Set up your money picture</h1>
			<p class="muted">
				Add your own accounts, income and costs. Once the first three are in, this page shows how
				much you can spend each day.
			</p>
			<ol class="checklist">
				{#each checklist as item, i (item.href)}
					<li class:done={item.done}>
						<span class="mark" aria-hidden="true">{item.done ? '✓' : i + 1}</span>
						<a href={item.href}>{item.label}</a>
						{#if item.done}<span class="visually-hidden">(done)</span>{/if}
						{#if item.optional}<span class="tag">Optional</span>{/if}
					</li>
				{/each}
			</ol>
		</section>
	{:else if app.entries.length === 0}
		<section class="panel first">
			<h1>Make your first entry to see your spending window</h1>
			<p class="muted">
				It takes a couple of minutes: today’s balances, plus what came in and went out since the
				1st. After that, make an entry whenever you like — each one covers the days since the last.
			</p>
			<a class="button primary" href="/entry">New entry for today</a>
		</section>
	{:else}
		<section class="headline" aria-labelledby="headline">
			{#if p.perDay >= 0}
				<h1 id="headline">
					<span class="lead">You can spend</span>
					<span class="big num">{formatMoney(p.perDay)}</span>
					<span class="lead">a day</span>
				</h1>
			{:else}
				<h1 id="headline">
					<span class="lead">You’re over by</span>
					<span class="big num neg">{formatAbs(p.perDay)}</span>
					<span class="lead">a day</span>
				</h1>
			{/if}
			<dl class="rates">
				<div>
					<dt>Per week</dt>
					<dd class="num">{formatMoney(p.perWeek)}</dd>
				</div>
				<div>
					<dt>Per month</dt>
					<dd class="num">{formatMoney(p.perMonth)}</dd>
				</div>
			</dl>
			<p class="small muted">
				Averaged over {monthShortLabel(p.months[0].month)} – {monthShortLabel(p.months[11].month)}
				after costs{app.settings.monthly_savings_goal_cents > 0
					? ` and saving ${formatMoney(app.settings.monthly_savings_goal_cents)} a month`
					: ''}, so summer and winter feel the same.
			</p>
			{#if latestEntry && daysSinceEntry !== null}
				<p class="last-entry small">
					Last entry {daysSinceEntry === 0
						? 'today'
						: daysSinceEntry === 1
							? 'yesterday'
							: `${dayShortLabel(latestEntry)}, ${daysSinceEntry} days ago`}
					· <a href="/entry">New entry</a>
				</p>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>{monthLabel(focus)}</h2>
				{#if !focusFigures.actual}
					<span class="tag">Expected</span>
				{:else}
					<span class="tag"
						>Entered through {dayShortLabel(dayIn(focus, focusFigures.coveredDays))}</span
					>
				{/if}
			</div>
			<table class="compare">
				<thead>
					<tr><th></th><th scope="col">Expected</th><th scope="col">So far</th></tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row">Income</th>
						<td class="num">{formatMoney(focusFigures.expectedIncome)}</td>
						<td class="num"
							>{focusFigures.actualIncome !== null
								? formatMoney(focusFigures.actualIncome)
								: '—'}</td
						>
					</tr>
					<tr>
						<th scope="row">Costs</th>
						<td class="num">{formatMoney(focusFigures.expectedCosts)}</td>
						<td class="num"
							>{focusFigures.actualCosts !== null ? formatMoney(focusFigures.actualCosts) : '—'}</td
						>
					</tr>
				</tbody>
			</table>
			<p class="instruction" class:draw={focusSetAside < 0}>
				{#if focusSetAside >= 0}
					<span class="icon" aria-hidden="true">↓</span>
					<span
						><strong>Set aside {formatAbs(focusSetAside)}</strong> into savings for leaner months.</span
					>
				{:else}
					<span class="icon" aria-hidden="true">↑</span>
					<span
						><strong>Draw {formatAbs(focusSetAside)}</strong> from your reserve to cover this month.</span
					>
				{/if}
			</p>
			<p class="small muted" style="margin: 0">
				Based on {focusFigures.actual
					? 'what you’ve entered so far plus what’s expected for the rest of the month'
					: 'what’s expected this month'}.
			</p>
		</section>

		{#if spending}
			<section class="panel">
				<h2>
					Spending {periodLabel(spending.period.start, spending.period.end)}
				</h2>
				<p class="spend">
					<span class="num big-ish">{formatMoney(spending.spent)}</span>
					<span class="muted">
						{spending.source === 'implied' ? 'worked out from your balances' : 'entered'} · window
						{formatMoney(spending.allowed)} for {spending.period.days}
						{spending.period.days === 1 ? 'day' : 'days'}
					</span>
				</p>
				<p class:pos={spending.difference >= 0} class:neg={spending.difference < 0}>
					<strong
						>{spending.difference >= 0 ? 'Under' : 'Over'} by {formatAbs(
							spending.difference
						)}</strong
					>
				</p>
				{#if spendingAvg && spendingAvg.entries > 1}
					<p class="small muted">
						Across your last {spendingAvg.entries} entries you’ve been {spendingAvg.perMonth >= 0
							? 'under'
							: 'over'} by about {formatAbs(spendingAvg.perMonth)} a month.
					</p>
				{/if}
			</section>
		{/if}

		<section class="panel">
			<h2>Next 12 months</h2>
			<CashFlowChart months={chartMonths} />
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Balances</h2>
				<a class="small" href="/accounts">Accounts</a>
			</div>
			{#if balances.length === 0}
				<p class="muted">No accounts yet.</p>
			{:else}
				<ul class="balances">
					{#each balances as b (b.account.id)}
						<li>
							<span>
								{b.account.name}
								{#if b.account.counts_toward_spending}<span class="tag moss">Spending</span>{/if}
							</span>
							<span class="num">{b.balance === null ? '—' : formatMoney(b.balance)}</span>
							<span class="num small muted change"
								>{b.change === null ? '' : formatSigned(b.change)}</span
							>
						</li>
					{/each}
				</ul>
				<p class="total">Total spendable <strong class="num">{formatMoney(spendable)}</strong></p>
			{/if}
		</section>

		{#if hasTax}
			<section class="panel">
				<h2>Tax reserve</h2>
				<p>
					Next payment <strong class="num">{formatMoney(tax.nextPayment)}</strong> due
					{dateLabel(tax.nextDue)}.
				</p>
				{#if !hasTaxAccount}
					<p class="muted small">
						Add an account with type “Tax reserve” to check you’re on track.
					</p>
				{:else if tax.onTrack}
					<p class="status ok">
						<span aria-hidden="true">✓</span> <strong>On track</strong> · {formatMoney(
							tax.balance ?? 0
						)} saved, {formatMoney(tax.needed)} needed so far
					</p>
				{:else}
					<p class="status short">
						<span aria-hidden="true">!</span> <strong>Short by {formatAbs(tax.shortBy)}</strong> · {formatMoney(
							tax.balance ?? 0
						)} saved, {formatMoney(tax.needed)} needed so far
					</p>
				{/if}
			</section>
		{/if}

		<section class="panel">
			<h2>Seasonal reserve</h2>
			{#if reserve.target <= 0}
				<p class="muted">No lean months ahead — income covers costs and spending every month.</p>
			{:else}
				<p>
					<strong class="num">{formatMoney(savings)}</strong> saved of
					<strong class="num">{formatMoney(reserve.target)}</strong> needed to cover the leanest stretch
					ahead.
				</p>
				<div
					class="bar"
					role="progressbar"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(reservePct)}
					aria-label="Seasonal reserve"
				>
					<span style="width: {reservePct}%"></span>
				</div>
				<p class="small muted">
					{savings >= reserve.target
						? 'Fully covered.'
						: `${formatMoney(reserve.target - savings)} to go. Savings accounts count toward this.`}
				</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.setup h1,
	.first h1 {
		font-size: var(--step-2);
	}
	.checklist {
		list-style: none;
		padding: 0;
		margin: 1rem 0 0;
		display: grid;
		gap: 0.5rem;
	}
	.checklist li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.checklist .mark {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		border: 1.5px solid var(--line);
		font-size: var(--step--1);
		font-weight: 600;
		color: var(--muted);
		flex: none;
	}
	.checklist .done .mark {
		background: var(--moss);
		border-color: var(--moss);
		color: var(--surface);
	}
	.checklist .done a {
		color: var(--muted);
	}
	.checklist a {
		font-weight: 500;
		padding: 0.4rem 0;
	}

	.headline {
		padding: 1.25rem 0 1.5rem;
	}
	.headline h1 {
		display: flex;
		flex-direction: column;
		margin: 0;
		font-weight: 600;
	}
	.lead {
		font-family: var(--font-body);
		font-size: var(--step-1);
		font-weight: 500;
		color: var(--muted);
		letter-spacing: 0;
	}
	.big {
		font-size: var(--step-4);
		line-height: 1;
		margin: 0.15rem 0 0.25rem;
		letter-spacing: -0.02em;
	}
	.rates {
		display: flex;
		gap: 2rem;
		margin: 1rem 0 0.75rem;
	}
	.rates div {
		display: grid;
	}
	.rates dt {
		font-size: var(--step--1);
		color: var(--muted);
	}
	.rates dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--step-2);
		font-weight: 600;
	}

	.last-entry {
		margin: 0;
		color: var(--muted);
	}
	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}
	.panel h2 {
		font-size: var(--step-1);
	}

	.compare {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 0.75rem;
	}
	.compare th,
	.compare td {
		padding: 0.35rem 0;
		text-align: right;
	}
	.compare thead th {
		font-size: var(--step--1);
		color: var(--muted);
		font-weight: 500;
	}
	.compare th[scope='row'] {
		text-align: left;
		font-weight: 500;
	}
	.compare tbody tr + tr {
		border-top: 1px solid var(--line);
	}

	.instruction {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		background: var(--moss-soft);
		color: var(--ink);
		border-radius: var(--radius-sm);
		padding: 0.75rem 0.9rem;
		margin: 0 0 0.5rem;
	}
	.instruction.draw {
		background: var(--clay-soft);
	}
	.instruction .icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--moss);
		color: var(--surface);
		font-weight: 700;
	}
	.instruction.draw .icon {
		background: var(--clay);
	}

	.spend {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin-bottom: 0.25rem;
	}
	.big-ish {
		font-family: var(--font-display);
		font-size: var(--step-3);
		font-weight: 600;
	}

	.balances {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.balances li {
		display: grid;
		grid-template-columns: 1fr auto 4.75rem;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--line);
	}
	.change {
		text-align: right;
	}
	.total {
		display: flex;
		justify-content: space-between;
		margin: 0.75rem 0 0;
	}

	.status {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.status.ok strong,
	.status.ok span[aria-hidden] {
		color: var(--moss);
	}
	.status.short strong,
	.status.short span[aria-hidden] {
		color: var(--clay);
	}

	.bar {
		height: 0.75rem;
		background: var(--sunken);
		border-radius: 999px;
		overflow: hidden;
		margin: 0.5rem 0;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--moss);
		border-radius: 999px;
	}
</style>
