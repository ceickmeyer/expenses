import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		description: 'Supabase project URL, e.g. https://<project>.supabase.co'
	},
	PUBLIC_SUPABASE_ANON_KEY: {
		public: true,
		description: 'Supabase anon / publishable key'
	}
});
