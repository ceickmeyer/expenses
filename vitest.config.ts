import { defineConfig } from 'vitest/config';

// The budget engine is framework-free, so tests run without the SvelteKit plugin
// (which would otherwise require Supabase env vars to be set).
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
