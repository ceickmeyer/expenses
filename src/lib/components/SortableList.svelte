<script lang="ts" generics="T extends { id: number }">
	import type { Snippet } from 'svelte';

	interface Props {
		items: T[];
		label: (item: T) => string;
		onreorder: (ids: number[]) => void;
		row: Snippet<[T, Snippet]>;
	}

	let { items, label, onreorder, row }: Props = $props();

	// Follows `items`, but is overwritten locally while dragging.
	let order = $derived(items);
	let draggingId = $state<number | null>(null);
	let list: HTMLOListElement | undefined = $state();
	let changed = false;

	function move(from: number, to: number) {
		if (to < 0 || to >= order.length || from === to) return;
		const next = [...order];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		order = next;
		changed = true;
	}

	function start(event: PointerEvent, id: number) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		draggingId = id;
		changed = false;
	}

	function drag(event: PointerEvent) {
		if (draggingId === null || !list) return;
		const rows = [...list.children] as HTMLElement[];
		const from = order.findIndex((i) => i.id === draggingId);
		let to = rows.findIndex((el) => {
			const box = el.getBoundingClientRect();
			return event.clientY < box.top + box.height / 2;
		});
		if (to === -1) to = rows.length - 1;
		else if (to > from) to -= 1;
		move(from, to);
	}

	function end() {
		if (draggingId !== null && changed) onreorder(order.map((i) => i.id));
		draggingId = null;
	}

	function keyMove(event: KeyboardEvent, id: number) {
		const from = order.findIndex((i) => i.id === id);
		const to = event.key === 'ArrowUp' ? from - 1 : event.key === 'ArrowDown' ? from + 1 : null;
		if (to === null) return;
		event.preventDefault();
		changed = false;
		move(from, to);
		if (changed) {
			onreorder(order.map((i) => i.id));
			requestAnimationFrame(() =>
				list?.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus()
			);
		}
	}
</script>

<ol class="sortable" bind:this={list}>
	{#each order as item (item.id)}
		<li class:dragging={draggingId === item.id}>
			{#snippet handle()}
				<button
					type="button"
					class="handle"
					data-handle={item.id}
					aria-label="Reorder {label(item)}. Use up and down arrow keys."
					onpointerdown={(e) => start(e, item.id)}
					onpointermove={drag}
					onpointerup={end}
					onpointercancel={end}
					onkeydown={(e) => keyMove(e, item.id)}
				>
					<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
						{#each [3, 8, 13] as y (y)}
							<circle cx="2.5" cy={y} r="1.4" /><circle cx="7.5" cy={y} r="1.4" />
						{/each}
					</svg>
				</button>
			{/snippet}
			{@render row(item, handle)}
		</li>
	{/each}
</ol>

<style>
	.sortable {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		transition: transform 120ms ease;
	}
	li.dragging {
		position: relative;
		z-index: 2;
		transform: scale(1.01);
		filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.15));
	}
	.handle {
		min-width: 2rem;
		min-height: 2.75rem;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--muted);
		cursor: grab;
		touch-action: none;
	}
	.handle svg {
		fill: currentColor;
	}
	.handle:active {
		cursor: grabbing;
	}
</style>
