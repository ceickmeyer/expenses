import { createServerClient } from '@supabase/ssr';
import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import type { Database } from '#lib/database.types.ts';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookies) => {
					for (const { name, value, options } of cookies) {
						event.cookies.set(name, value, { ...options, path: '/' });
					}
				}
			}
		}
	);

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	// getUser() validates the token with Supabase Auth instead of trusting the cookie.
	const { data, error } = await event.locals.supabase.auth.getUser();
	event.locals.user = error ? null : data.user;

	const onLogin = event.url.pathname === '/login';
	if (!event.locals.user && !onLogin) redirect(303, '/login');
	if (event.locals.user && onLogin) redirect(303, '/');

	return resolve(event);
};

export const handle = sequence(supabase, authGuard);
