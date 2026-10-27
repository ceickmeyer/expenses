<script lang="ts">
	import { toasts } from '#lib/toast.svelte.ts';
</script>

<div class="toasts" role="status" aria-live="polite">
	{#each toasts as t (t.id)}
		<p class="toast" class:error={t.tone === 'error'}>
			<span aria-hidden="true">{t.tone === 'error' ? '!' : '✓'}</span>
			{t.message}
		</p>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		inset: auto 0 calc(1rem + env(safe-area-inset-bottom)) 0;
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		pointer-events: none;
		z-index: 50;
		padding: 0 1rem;
	}
	.toast {
		margin: 0;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		background: var(--ink);
		color: var(--paper);
		padding: 0.65rem 1rem;
		border-radius: 999px;
		font-size: var(--step--1);
		box-shadow: var(--shadow);
		animation: rise 180ms ease-out;
	}
	.toast span {
		font-weight: 700;
		color: var(--moss-on-ink);
	}
	.toast.error span {
		color: var(--clay-on-ink);
	}
	@keyframes rise {
		from {
			transform: translateY(0.5rem);
			opacity: 0;
		}
	}
</style>
