<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let busy = $state(false);
</script>

<svelte:head><title>Log in · Money</title></svelte:head>

<div class="wrap">
	<form
		method="post"
		class="panel"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<h1>Money</h1>
		<p class="muted">Log in to see what you can spend.</p>
		<label>Email <input type="email" name="email" autocomplete="username" required value={form?.email ?? ''} /></label>
		<label>Password <input type="password" name="password" autocomplete="current-password" required /></label>
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
		<button class="primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
	</form>
</div>

<style>
	.wrap {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: var(--gutter);
	}
	form {
		width: min(100%, 22rem);
		display: grid;
		gap: 0.9rem;
		padding: 1.5rem;
	}
	h1 {
		margin: 0;
	}
	p {
		margin: 0;
	}
	.error {
		color: var(--clay);
		font-size: var(--step--1);
	}
</style>
