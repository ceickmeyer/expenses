<script lang="ts">
	import {
		accountBalances,
		balanceSeries,
		countsTowardGrowth,
		daysBetween,
		summary,
		taxStatus
	} from '#lib/budget.ts';
	import GrowthChart from '#lib/components/GrowthChart.svelte';
	import { dateLabel, dayShortLabel, periodLabel, today } from '#lib/format.ts';
	import { formatAbs, formatMoney, formatSigned } from '#lib/money.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const app = $derived(data.app!);
	const now = new Date();

	const checklist = $derived([
		{ label: 'Add your accounts', href: '/accounts', done: app.accounts.length > 0 },
		{ label: 'Add your bills', href: '/bills', done: app.bills.length > 0 },
		{ label: 'Check in with today’s balances', href: '/checkin', done: app.checkins.length > 0 }
	]);
	const setupDone = $derived(checklist.every((c) => c.done));

	const s = $derived(summary(app));
	const latest = $derived(app.checkins.at(-1) ?? null);
	const daysSince = $derived(latest ? daysBetween(latest.date, today()) : null);
	const chart = $derived(balanceSeries(app));

	const balances = $derived(accountBalances(app));
	const growthTotal = $derived(
		balances
			.filter((b) => countsTowardGrowth(b.account))
			.reduce((sum, b) => sum + (b.balance ?? 0), 0)
	);
	const tax = $derived(taxStatus(app, now));
	const hasTax = $derived(
		app.bills.some((b) => b.is_tax && b.frequency === 'quarterly' && !b.archived)
	);
	const hasTaxAccount = $derived(app.accounts.some((a) => a.type === 'tax_reserve' && !a.archived));
</script>

<svelte:head><title>Money</title></svelte:head>

<div class="page">
	{#if !setupDone}
		<section class="panel setup">
			<p class="eyebrow">Getting started</p>
			<h1>Set up your money picture</h1>
			<p class="muted">
				Three steps. After that, check in about once a month with your balances and main-job pay.
			</p>
			<ol class="checklist">
				{#each checklist as item, i (item.href)}
					<li class:done={item.done}>
						<span class="mark" aria-hidden="true">{item.done ? '✓' : i + 1}</span>
						<a href={item.href}>{item.label}</a>
						{#if item.done}<span class="visually-hidden">(done)</span>{/if}
					</li>
				{/each}
			</ol>
		</section>
	{:else if !s}
		<section class="panel first">
			<h1>Check in again in a few weeks</h1>
			<p class="muted">
				Your first check-in on {dayShortLabel(latest!.date)} set the starting point. From the next one,
				you’ll see how your balances grew and how much room you have to spend.
			</p>
			<a class="button primary" href="/checkin">Check in</a>
		</section>
	{:else}
		<section class="headline" aria-labelledby="headline">
			<h1 id="headline">
				{#if s.perDay >= 0}
					<span class="big num">{formatMoney(s.perDay)}</span>
					<span class="lead">a day of extra room</span>
				{:else}
					<span class="big num neg">{formatAbs(s.perDay)}</span>
					<span class="lead">a day to cut back</span>
				{/if}
			</h1>
			<p class="muted">
				{#if s.perDay >= 0}
					You could spend this much more each day than you do now and still
					{s.savingsGoal > 0 ? `save ${formatMoney(s.savingsGoal)} a month` : 'break even'}.
				{:else if s.savingsGoal > 0}
					To save {formatMoney(s.savingsGoal)} a month, spend this much less each day.
				{:else}
					Your balances are shrinking. Spend this much less each day to break even.
				{/if}
			</p>
			<dl class="rates">
				<div>
					<dt>Per week</dt>
					<dd class="num">{formatSigned(s.perWeek)}</dd>
				</div>
				<div>
					<dt>Per month</dt>
					<dd class="num">{formatSigned(s.spare)}</dd>
				</div>
			</dl>
			{#if latest && daysSince !== null}
				<p class="last small">
					Last check-in {daysSince === 0
						? 'today'
						: daysSince === 1
							? 'yesterday'
							: `${dayShortLabel(latest.date)}, ${daysSince} days ago`}
					· <a href="/checkin">Check in</a>
				</p>
			{/if}
		</section>

		<section class="panel">
			<h2>Where it comes from</h2>
			<p class="small muted">
				Monthly average over {periodLabel(s.periods[0].start, s.periods.at(-1)!.end)} ({s.days}
				days).
			</p>
			<dl class="breakdown">
				<div>
					<dt>Main job</dt>
					<dd class="num">+{formatMoney(s.perMonth.mainIncome)}</dd>
				</div>
				<div>
					<dt>Everything else <span class="hint">side income minus spending</span></dt>
					<dd class="num">{formatSigned(s.perMonth.other)}</dd>
				</div>
				<div>
					<dt>Bills</dt>
					<dd class="num">−{formatMoney(s.perMonth.bills)}</dd>
				</div>
				<div class="sum">
					<dt>Balances grew</dt>
					<dd class="num">{formatSigned(s.perMonth.growth)}</dd>
				</div>
				<div>
					<dt>Savings goal</dt>
					<dd class="num">−{formatMoney(s.savingsGoal)}</dd>
				</div>
				<div class="sum">
					<dt>Extra room</dt>
					<dd class="num" class:pos={s.spare >= 0} class:neg={s.spare < 0}>
						{formatSigned(s.spare)}
					</dd>
				</div>
			</dl>
		</section>
	{/if}

	{#if app.checkins.length > 0}
		<section class="panel">
			<h2>Balances over time</h2>
			{#if chart.dates.length < 2}
				<p class="muted">The chart appears after your second check-in.</p>
			{:else}
				<GrowthChart dates={chart.dates} series={chart.series} />
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Balances</h2>
				<a class="small" href="/accounts">Accounts</a>
			</div>
			<ul class="balances">
				{#each balances as b (b.account.id)}
					<li>
						<span>
							{b.account.name}
							{#if !b.account.counts_toward_spending}<span class="tag">Not in growth</span>{/if}
						</span>
						<span class="num">{b.balance === null ? '—' : formatMoney(b.balance)}</span>
						<span
							class="num small change"
							class:pos={(b.change ?? 0) > 0}
							class:neg={(b.change ?? 0) < 0}
							>{b.change === null ? '' : formatSigned(b.change)}</span
						>
					</li>
				{/each}
			</ul>
			<p class="total">
				Counted toward growth <strong class="num">{formatMoney(growthTotal)}</strong>
			</p>
		</section>
	{/if}

	{#if hasTax && setupDone}
		<section class="panel">
			<h2>Tax reserve</h2>
			<p>
				Next payment <strong class="num">{formatMoney(tax.nextPayment)}</strong> due
				{dateLabel(tax.nextDue)}.
			</p>
			{#if !hasTaxAccount}
				<p class="muted small">Add an account with type “Tax reserve” to check you’re on track.</p>
			{:else if tax.onTrack}
				<p class="status ok">
					<span aria-hidden="true">✓</span> <strong>On track</strong> · {formatMoney(
						tax.balance ?? 0
					)} saved, {formatMoney(tax.needed)} needed so far
				</p>
			{:else}
				<p class="status short">
					<span aria-hidden="true">!</span> <strong>Short by {formatAbs(tax.shortBy)}</strong> ·
					{formatMoney(tax.balance ?? 0)} saved, {formatMoney(tax.needed)} needed so far
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
		margin: 0 0 0.5rem;
	}
	.big {
		font-size: var(--step-4);
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.lead {
		font-family: var(--font-body);
		font-size: var(--step-1);
		font-weight: 500;
		color: var(--muted);
		letter-spacing: 0;
		margin-top: 0.3rem;
	}
	.rates {
		display: flex;
		gap: 2rem;
		margin: 0.75rem 0;
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
	.last {
		margin: 0;
		color: var(--muted);
	}

	.panel h2 {
		font-size: var(--step-1);
	}
	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.breakdown {
		margin: 0;
		display: grid;
	}
	.breakdown div {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.breakdown div:last-child {
		border-bottom: none;
	}
	.breakdown dt {
		color: var(--muted);
	}
	.breakdown dd {
		margin: 0;
	}
	.breakdown .hint {
		display: block;
		font-size: var(--step--2);
	}
	.breakdown .sum dt,
	.breakdown .sum dd {
		color: var(--ink);
		font-weight: 600;
	}
	.breakdown .sum dd.pos {
		color: var(--moss);
	}
	.breakdown .sum dd.neg {
		color: var(--clay);
	}

	.balances {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.balances li {
		display: grid;
		grid-template-columns: 1fr auto 5rem;
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
</style>
