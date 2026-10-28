<script lang="ts">
	import {
		CategoryScale,
		Chart,
		LinearScale,
		LineController,
		LineElement,
		PointElement,
		Tooltip,
		type Plugin
	} from 'chart.js';
	import { untrack } from 'svelte';
	import { addDays, daysBetween, type Day, type Series } from '#lib/budget.ts';
	import { dayMediumLabel, dayShortLabel } from '#lib/format.ts';
	import { formatMoney, formatSigned } from '#lib/money.ts';

	Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip);

	interface Props {
		dates: Day[];
		/** The first series is the combined total. */
		series: Series[];
	}

	let { dates, series }: Props = $props();

	type Mode = 'balance' | 'growth';
	type Range = '3m' | '6m' | '1y' | 'all';
	const ranges: { id: Range; label: string; days: number | null }[] = [
		{ id: '3m', label: '3M', days: 92 },
		{ id: '6m', label: '6M', days: 183 },
		{ id: '1y', label: '1Y', days: 366 },
		{ id: 'all', label: 'All', days: null }
	];

	let mode = $state<Mode>('balance');
	let range = $state<Range>('all');
	let hidden = $state<Set<Series['id']>>(new Set());

	// Fixed colour per account by its position, so hiding one never repaints the others.
	const colorVar = (s: Series, i: number) =>
		s.id === 'total' ? '--ink' : `--series-${((i - 1) % 8) + 1}`;

	/** Index of the first check-in inside the selected range. */
	const startIndex = $derived.by(() => {
		const days = ranges.find((r) => r.id === range)!.days;
		if (days === null || dates.length === 0) return 0;
		const from = addDays(dates[dates.length - 1], -days);
		const i = dates.findIndex((d) => d >= from);
		return Math.max(0, Math.min(i, dates.length - 2));
	});

	const view = $derived.by(() => {
		const shownDates = dates.slice(startIndex);
		const rows = series.map((s, i) => {
			const raw = s.values.slice(startIndex);
			const base = raw.find((v) => v !== null) ?? null;
			const values =
				mode === 'growth' ? raw.map((v) => (v === null || base === null ? null : v - base)) : raw;
			return { ...s, color: colorVar(s, i), raw, values };
		});
		return { dates: shownDates, rows };
	});

	const visibleRows = $derived(view.rows.filter((r) => !hidden.has(r.id)));

	function toggle(id: Series['id']) {
		const next = new Set(hidden);
		if (next.has(id)) next.delete(id);
		else if (visibleRows.length > 1) next.add(id); // keep at least one line
		hidden = next;
	}

	// --- Tooltip state, rendered as HTML so it can hold a full breakdown -----------

	let active = $state<{ index: number; x: number } | null>(null);
	let wrap: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart<'line'> | undefined;

	// Wide plots get a floating tooltip; narrow ones a readout docked under the chart, which
	// shows the latest check-in until you touch or arrow through the chart.
	let plotWidth = $state(0);
	const floating = $derived(plotWidth >= 560);
	const readoutIndex = $derived(active ? active.index : floating ? null : view.dates.length - 1);

	const tip = $derived.by(() => {
		if (readoutIndex === null || readoutIndex < 0) return null;
		const i = readoutIndex;
		const date = view.dates[i];
		const prevDate = i > 0 ? view.dates[i - 1] : null;
		const lines = visibleRows
			.map((r) => {
				const value = r.values[i];
				const prev = i > 0 ? r.raw[i - 1] : null;
				const change =
					value !== null && prev !== null && r.raw[i] !== null ? r.raw[i]! - prev : null;
				const sinceStart = mode === 'balance' ? null : value;
				return { id: r.id, name: r.name, color: r.color, balance: r.raw[i], change, sinceStart };
			})
			.filter((l) => l.balance !== null);
		return { date, prevDate, lines };
	});

	const TIP_WIDTH = 290;
	const tipLeft = $derived.by(() => {
		if (!active) return 0;
		// Right of the cursor, or left of it when that would run off the edge.
		const right = active.x + 16;
		return right + TIP_WIDTH <= plotWidth - 4 ? right : Math.max(4, active.x - 16 - TIP_WIDTH);
	});

	// --- Chart -------------------------------------------------------------------

	function tokens() {
		const css = getComputedStyle(document.documentElement);
		return (name: string) => css.getPropertyValue(name).trim();
	}

	const compact = (cents: number) => {
		const d = cents / 100;
		const abs = Math.abs(d);
		const sign = d < 0 ? '−' : '';
		if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
		if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
		return `${sign}$${Math.round(abs)}`;
	};

	const tickDate = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		year: '2-digit',
		timeZone: 'UTC'
	});
	const toX = (d: Day) => Date.parse(`${d}T00:00:00Z`);

	// Vertical line at the hovered check-in.
	const crosshair: Plugin<'line'> = {
		id: 'crosshair',
		afterDatasetsDraw(c) {
			// Read without tracking: drawing happens inside the chart effect, and hovering
			// shouldn't rebuild the chart.
			const current = untrack(() => active);
			if (!current) return;
			const x = c.scales.x.getPixelForValue(toX(untrack(() => view.dates)[current.index]));
			const { top, bottom } = c.chartArea;
			c.ctx.save();
			c.ctx.strokeStyle = tokens()('--muted');
			c.ctx.lineWidth = 1;
			c.ctx.setLineDash([3, 3]);
			c.ctx.beginPath();
			c.ctx.moveTo(x, top);
			c.ctx.lineTo(x, bottom);
			c.ctx.stroke();
			c.ctx.restore();
		}
	};

	// Redraw when the system theme flips.
	let theme = $state(0);
	$effect(() => {
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		const bump = () => theme++;
		scheme.addEventListener('change', bump);
		return () => scheme.removeEventListener('change', bump);
	});

	$effect(() => {
		if (!canvas) return;
		void theme;
		const v = tokens();
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const xs = view.dates.map(toX);

		const c = new Chart(canvas, {
			type: 'line',
			data: {
				datasets: visibleRows.map((r) => ({
					label: r.name,
					data: r.values.map((y, i) => ({ x: xs[i], y: y === null ? null : y })) as {
						x: number;
						y: number;
					}[],
					borderColor: v(r.color),
					backgroundColor: v(r.color),
					borderWidth: r.id === 'total' ? 3 : 2,
					pointRadius: xs.length > 24 ? 0 : r.id === 'total' ? 3.5 : 3,
					pointHoverRadius: 6,
					pointBorderColor: v('--surface'),
					pointBorderWidth: 2,
					pointHitRadius: 12,
					spanGaps: false,
					tension: 0,
					order: r.id === 'total' ? 0 : 1
				}))
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: reduceMotion ? false : { duration: 250 },
				interaction: { mode: 'index', intersect: false, axis: 'x' },
				scales: {
					x: {
						type: 'linear',
						min: xs[0],
						max: xs[xs.length - 1],
						grid: { display: false },
						border: { color: v('--line') },
						ticks: {
							color: v('--muted'),
							font: { family: v('--font-body'), size: 11 },
							maxTicksLimit: 6,
							maxRotation: 0,
							callback: (value) => tickDate.format(new Date(Number(value)))
						}
					},
					y: {
						border: { display: false },
						grid: { color: v('--line') },
						ticks: {
							color: v('--muted'),
							font: { family: v('--font-body'), size: 11 },
							maxTicksLimit: 5,
							callback: (value) =>
								(mode === 'growth' && Number(value) > 0 ? '+' : '') + compact(Number(value))
						}
					}
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						enabled: false,
						external: ({ tooltip }) => {
							if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
								if (!keyboard) active = null;
								return;
							}
							keyboard = false;
							active = { index: tooltip.dataPoints[0].dataIndex, x: tooltip.caretX };
						}
					}
				}
			},
			plugins: [crosshair]
		});
		chart = c;
		return () => {
			c.destroy();
			chart = undefined;
		};
	});

	// --- Keyboard: arrow keys step through check-ins ------------------------------

	let keyboard = false;

	function onkeydown(event: KeyboardEvent) {
		if (!chart || view.dates.length === 0) return;
		const last = view.dates.length - 1;
		let index = active?.index ?? last;
		if (event.key === 'ArrowLeft') index = Math.max(0, index - (active ? 1 : 0));
		else if (event.key === 'ArrowRight') index = Math.min(last, index + (active ? 1 : 0));
		else if (event.key === 'Home') index = 0;
		else if (event.key === 'End') index = last;
		else if (event.key === 'Escape') {
			active = null;
			chart.update('none');
			return;
		} else return;
		event.preventDefault();
		keyboard = true;
		active = { index, x: chart.scales.x.getPixelForValue(toX(view.dates[index])) };
		chart.update('none');
	}

	const spanLabel = $derived(
		view.dates.length > 1
			? `${dayMediumLabel(view.dates[0])} – ${dayMediumLabel(view.dates[view.dates.length - 1])} · ${daysBetween(view.dates[0], view.dates[view.dates.length - 1])} days`
			: ''
	);
</script>

<div class="controls">
	<div class="segmented" role="group" aria-label="Show">
		<button type="button" aria-pressed={mode === 'balance'} onclick={() => (mode = 'balance')}
			>Balance</button
		>
		<button type="button" aria-pressed={mode === 'growth'} onclick={() => (mode = 'growth')}
			>Growth</button
		>
	</div>
	<div class="segmented" role="group" aria-label="Time range">
		{#each ranges as r (r.id)}
			<button type="button" aria-pressed={range === r.id} onclick={() => (range = r.id)}
				>{r.label}</button
			>
		{/each}
	</div>
</div>

<div class="legend" role="group" aria-label="Lines shown">
	{#each view.rows as r (r.id)}
		<button
			type="button"
			class="chip"
			class:off={hidden.has(r.id)}
			class:total={r.id === 'total'}
			aria-pressed={!hidden.has(r.id)}
			onclick={() => toggle(r.id)}
		>
			<i style="background: var({r.color})"></i>{r.name}
		</button>
	{/each}
</div>

<!-- Focusable so arrow keys can step through check-ins. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="plot"
	bind:this={wrap}
	bind:clientWidth={plotWidth}
	tabindex="0"
	role="group"
	aria-label="Balance chart. Use left and right arrow keys to step through check-ins."
	{onkeydown}
	onpointermove={() => (keyboard = false)}
	onblur={() => {
		active = null;
		chart?.update('none');
	}}
>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	{#if tip && floating && active}
		<div class="tip floating" style="left: {tipLeft}px; width: {TIP_WIDTH}px">
			{@render readout(tip)}
		</div>
	{/if}
</div>
{#if tip && !floating}
	<div class="tip docked" aria-live="polite">
		{@render readout(tip)}
	</div>
{/if}
<p class="span small muted">{spanLabel}</p>

{#snippet readout(t: NonNullable<typeof tip>)}
	<p class="tip-date">
		{dayMediumLabel(t.date)}
		{#if !active && !floating}<span class="tip-hint">· latest — tap the chart to explore</span>{/if}
	</p>
	<table>
		<thead>
			<tr>
				<th scope="col"><span class="visually-hidden">Account</span></th>
				<th scope="col"
					>{mode === 'balance' ? 'Balance' : `Since ${dayShortLabel(view.dates[0])}`}</th
				>
				<th scope="col">{t.prevDate ? `Since ${dayShortLabel(t.prevDate)}` : ''}</th>
			</tr>
		</thead>
		<tbody>
			{#each t.lines as l (l.id)}
				{@const main = mode === 'balance' ? l.balance : l.sinceStart}
				<tr class:total={l.id === 'total'}>
					<th scope="row"><i style="background: var({l.color})"></i>{l.name}</th>
					<td class="num">
						{main === null ? '—' : mode === 'balance' ? formatMoney(main) : formatSigned(main)}
					</td>
					<td class="num delta" class:pos={(l.change ?? 0) > 0} class:neg={(l.change ?? 0) < 0}
						>{l.change === null ? '' : formatSigned(l.change)}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<details class="table-view">
	<summary>Show as a table</summary>
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th scope="col">Check-in</th>
					{#each view.rows as r (r.id)}<th scope="col">{r.name}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each view.dates as d, i (d)}
					<tr>
						<th scope="row">{dayMediumLabel(d)}</th>
						{#each view.rows as r (r.id)}
							<td class="num">{r.raw[i] === null ? '—' : formatMoney(r.raw[i]!)}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.segmented {
		display: inline-flex;
		padding: 0.2rem;
		background: var(--sunken);
		border-radius: var(--radius-sm);
	}
	.segmented button {
		min-height: 2.25rem;
		padding: 0.3rem 0.75rem;
		border: none;
		background: transparent;
		color: var(--muted);
		font-size: var(--step--1);
	}
	.segmented button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		font-weight: 600;
		box-shadow: var(--shadow-sm);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.75rem;
	}
	.chip {
		min-height: 2.25rem;
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		font-size: var(--step--1);
		gap: 0.45rem;
	}
	.chip.total {
		font-weight: 600;
	}
	.chip.off {
		color: var(--muted);
		text-decoration: line-through;
	}
	.chip.off i {
		opacity: 0.3;
	}
	i {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 3px;
		flex: none;
	}
	.plot {
		position: relative;
		height: 17rem;
		border-radius: var(--radius-sm);
	}
	.tip {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow);
		padding: 0.6rem 0.7rem;
		font-size: var(--step--1);
	}
	.tip.floating {
		position: absolute;
		top: 0.25rem;
		pointer-events: none;
		z-index: 3;
	}
	.tip.docked {
		margin-top: 0.6rem;
		box-shadow: none;
		background: var(--paper);
	}
	.tip-hint {
		font-weight: 400;
		font-size: var(--step--2);
		color: var(--muted);
	}
	.tip-date {
		margin: 0;
		font-weight: 600;
	}
	.tip table {
		width: 100%;
		border-collapse: collapse;
	}
	.tip th {
		text-align: left;
		font-weight: 400;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.15rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 11rem;
	}
	.tip td {
		text-align: right;
		padding: 0.15rem 0 0.15rem 0.85rem;
		white-space: nowrap;
	}
	.tip tr.total th,
	.tip tr.total td {
		font-weight: 600;
	}
	.tip .delta {
		font-size: var(--step--2);
	}
	.tip thead th {
		font-size: var(--step--2);
		font-weight: 500;
		color: var(--muted);
		text-align: right;
		padding: 0 0 0.2rem 0.85rem;
		display: table-cell;
		white-space: nowrap;
	}
	.span {
		margin: 0.4rem 0 0;
	}
	.table-view {
		margin-top: 0.5rem;
	}
	.scroll {
		overflow-x: auto;
		margin-top: 0.5rem;
	}
	.table-view table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--step--1);
	}
	.table-view th,
	.table-view td {
		text-align: right;
		padding: 0.3rem 0.5rem;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}
	.table-view th[scope='row'],
	.table-view thead th:first-child {
		text-align: left;
		font-weight: 400;
	}
	.table-view thead th {
		color: var(--muted);
		font-weight: 600;
	}
</style>
