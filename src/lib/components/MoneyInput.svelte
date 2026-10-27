<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { centsToInput, parseMoney } from '#lib/money.ts';

	interface Props extends Omit<HTMLInputAttributes, 'value'> {
		/** Raw text the person typed: "1,500", "$1,500.00" … */
		value?: string;
		invalid?: boolean;
	}

	let { value = $bindable(''), invalid = false, class: className = '', ...rest }: Props = $props();

	const bad = $derived(invalid || Number.isNaN(parseMoney(value)));

	function tidy() {
		const cents = parseMoney(value);
		if (cents !== null && !Number.isNaN(cents)) value = centsToInput(cents);
	}
</script>

<span class="money-input {className}" class:bad>
	<span class="prefix" aria-hidden="true">$</span>
	<input
		type="text"
		inputmode="decimal"
		autocomplete="off"
		bind:value
		onblur={tidy}
		aria-invalid={bad || undefined}
		{...rest}
	/>
</span>

<style>
	.money-input {
		position: relative;
		display: inline-flex;
		align-items: center;
		width: 100%;
	}
	.prefix {
		position: absolute;
		left: 0.7rem;
		color: var(--muted);
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}
	input {
		width: 100%;
		padding-left: 1.5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bad input {
		border-color: var(--clay);
		box-shadow: 0 0 0 1px var(--clay);
	}
</style>
