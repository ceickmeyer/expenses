<script lang="ts">
	import {
		BarController,
		BarElement,
		CategoryScale,
		Chart,
		LinearScale,
		LineController,
		LineElement,
		PointElement,
		Tooltip,
		type Plugin
	} from 'chart.js';
	import { monthLabel, monthTinyLabel } from '#lib/format.ts';
	import { formatMoney } from '#lib/money.ts';
	import type { Month } from '#lib/budget.ts';

	Chart.register(
		BarController,
		BarElement,
		CategoryScale,
		LinearScale,
		LineController,
		LineElement,
		PointElement,
		Tooltip
	);

	export interface CashFlowMonth {
		month: Month;
		income: number;
		costs: number;
		actual: boolean;
	}

	let { months }: { months: CashFlowMonth[] } = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	// Bumped when the system theme flips so the chart redraws with the other tokens.
	let theme = $state(0);

	$effect(() => {
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		const bump = () => theme++;
		scheme.addEventListener('change', bump);
		return () => scheme.removeEventListener('change', bump);
	});
	const short = $derived(months.map((m) => m.income < m.costs));

	function tokens() {
		const css = getComputedStyle(document.documentElement);
		const v = (name: string) => css.getPropertyValue(name).trim();
		return {
			income: v('--chart-income'),
			cost: v('--chart-cost'),
			surface: v('--surface'),
			ink: v('--ink'),
			muted: v('--muted'),
			line: v('--line'),
			clayWash: v('--clay-soft'),
			font: v('--font-body')
		};
	}

	const compact = (cents: number) => {
		const d = cents / 100;
		return Math.abs(d) >= 1000 ? `$${Math.round(d / 1000)}k` : `$${Math.round(d)}`;
	};

	// Shade the background of months where costs are above income.
	const shortfallBands: Plugin<'bar'> = {
		id: 'shortfallBands',
		beforeDatasetsDraw(chart) {
			const { ctx, chartArea, scales } = chart;
			const x = scales.x;
			const step = x.width / Math.max(months.length, 1);
			ctx.save();
			ctx.fillStyle = tokens().clayWash;
			months.forEach((m, i) => {
				if (m.income >= m.costs) return;
				const center = x.getPixelForValue(i);
				ctx.fillRect(center - step / 2, chartArea.top, step, chartArea.bottom - chartArea.top);
			});
			ctx.restore();
		}
	};

	$effect(() => {
		if (!canvas) return;
		void theme;
		const t = tokens();
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

		const chart = new Chart(canvas, {
			type: 'bar',
			data: {
				labels: months.map((m) => monthTinyLabel(m.month)),
				datasets: [
					{
						type: 'bar',
						label: 'Income',
						data: months.map((m) => m.income / 100),
						// Actual months solid, expected months outlined.
						backgroundColor: months.map((m) => (m.actual ? t.income : 'transparent')),
						borderColor: t.income,
						borderWidth: months.map((m) => (m.actual ? 0 : 2)),
						borderRadius: { topLeft: 4, topRight: 4 },
						borderSkipped: 'bottom',
						categoryPercentage: 0.75,
						barPercentage: 0.9,
						order: 2
					},
					{
						type: 'line',
						label: 'Costs',
						data: months.map((m) => m.costs / 100),
						borderColor: t.cost,
						backgroundColor: t.cost,
						borderWidth: 2,
						pointRadius: 4,
						pointHoverRadius: 6,
						pointBorderColor: t.surface,
						pointBorderWidth: 2,
						tension: 0,
						order: 1
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: reduceMotion ? false : { duration: 300 },
				interaction: { mode: 'index', intersect: false },
				scales: {
					x: {
						grid: { display: false },
						border: { color: t.line },
						ticks: {
							color: (ctx) => (short[ctx.index] ? t.ink : t.muted),
							font: (ctx) => ({ family: t.font, size: 11, weight: short[ctx.index] ? 700 : 400 })
						}
					},
					y: {
						beginAtZero: true,
						border: { display: false },
						grid: { color: t.line, lineWidth: 1 },
						ticks: {
							color: t.muted,
							font: { family: t.font, size: 11 },
							maxTicksLimit: 5,
							callback: (v) => compact(Number(v) * 100)
						}
					}
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: t.ink,
						titleColor: t.surface,
						bodyColor: t.surface,
						titleFont: { family: t.font, weight: 600 },
						bodyFont: { family: t.font },
						padding: 10,
						boxPadding: 4,
						usePointStyle: true,
						callbacks: {
							title: (items) => {
								const m = months[items[0].dataIndex];
								return `${monthLabel(m.month)} · ${m.actual ? 'actual' : 'expected'}`;
							},
							label: (item) => `${item.dataset.label}: ${formatMoney(Number(item.raw) * 100)}`,
							footer: (items) => {
								const m = months[items[0].dataIndex];
								const diff = m.income - m.costs;
								return diff < 0
									? `Short by ${formatMoney(-diff)}`
									: `Left after costs: ${formatMoney(diff)}`;
							}
						}
					}
				}
			},
			plugins: [shortfallBands]
		});

		return () => chart.destroy();
	});
</script>

<figure>
	<div class="legend" aria-hidden="true">
		<span><i class="swatch solid"></i>Income, actual</span>
		<span><i class="swatch outline"></i>Income, expected</span>
		<span><i class="swatch line"></i>Costs</span>
		<span><i class="swatch short"></i>Costs above income</span>
	</div>
	<div class="plot">
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<p class="visually-hidden">
			Chart of income and costs for 12 months. The same numbers are in the table below.
		</p>
	</div>
	<details>
		<summary>Show as a table</summary>
		<table>
			<thead>
				<tr
					><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Costs</th><th
						scope="col">Difference</th
					></tr
				>
			</thead>
			<tbody>
				{#each months as m (m.month)}
					<tr>
						<th scope="row">{monthLabel(m.month)}{m.actual ? '' : ' (expected)'}</th>
						<td class="num">{formatMoney(m.income)}</td>
						<td class="num">{formatMoney(m.costs)}</td>
						<td class="num">
							{m.income < m.costs
								? `Short ${formatMoney(m.costs - m.income)}`
								: formatMoney(m.income - m.costs)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</figure>

<style>
	figure {
		margin: 0;
	}
	.plot {
		position: relative;
		height: 15rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		font-size: var(--step--2);
		color: var(--muted);
		margin-bottom: 0.6rem;
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.swatch {
		display: inline-block;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 3px;
	}
	.solid {
		background: var(--chart-income);
	}
	.outline {
		border: 2px solid var(--chart-income);
	}
	.line {
		height: 2px;
		background: var(--chart-cost);
	}
	.short {
		background: var(--clay-soft);
	}
	details {
		margin-top: 0.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--step--1);
		margin-top: 0.5rem;
	}
	th,
	td {
		text-align: right;
		padding: 0.3rem 0.4rem;
		border-bottom: 1px solid var(--line);
	}
	th[scope='row'],
	thead th:first-child {
		text-align: left;
		font-weight: 400;
	}
	thead th {
		color: var(--muted);
		font-weight: 600;
	}
</style>
