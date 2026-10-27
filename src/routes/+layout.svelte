<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import QuickAdd from '#lib/components/QuickAdd.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import { openQuickAdd } from '#lib/quickadd.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/entry', label: 'Enter month' },
		{ href: '/history', label: 'History' },
		{ href: '/sources', label: 'Income' },
		{ href: '/costs', label: 'Costs' },
		{ href: '/accounts', label: 'Accounts' },
		{ href: '/settings', label: 'Settings' }
	];

	function current(href: string) {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Money</title>
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

{#if data.email}
	<header class="top">
		<div class="bar">
			<a class="brand" href="/">Money</a>
			<div class="actions">
				<button type="button" class="primary add" onclick={() => openQuickAdd()}>
					<span aria-hidden="true">+</span> Add
				</button>
				<form method="post" action="/logout" use:enhance>
					<button class="quiet">Log out</button>
				</form>
			</div>
		</div>
		<nav aria-label="Main">
			{#each links as link (link.href)}
				<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
	</header>
	<QuickAdd />
{/if}

<main id="main">
	{@render children()}
</main>

<Toasts />

<style>
	.skip {
		position: absolute;
		left: -999px;
		top: 0.5rem;
		background: var(--surface);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		z-index: 60;
	}
	.skip:focus {
		left: 0.5rem;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--paper) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--line);
	}
	.bar,
	nav {
		max-width: 46rem;
		margin: 0 auto;
		padding: 0 var(--gutter);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.6rem;
	}
	.brand {
		font-family: var(--font-display);
		font-size: var(--step-1);
		font-weight: 600;
		text-decoration: none;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.add {
		min-height: 2.5rem;
		padding-inline: 0.9rem;
	}
	.add span {
		font-size: 1.2em;
		line-height: 1;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 0.15rem;
	}
	nav a {
		flex: none;
		padding: 0.55rem 0.6rem;
		font-size: var(--step--1);
		color: var(--muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
	}
	nav a[aria-current='page'] {
		color: var(--ink);
		font-weight: 600;
		border-bottom-color: var(--ink);
	}
</style>
