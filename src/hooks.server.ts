import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { redirect, type Handle } from '@sveltejs/kit';
import type { Database } from '$lib/types/database';

const PROTECTED_ROUTES = ['/places', '/upload', '/api/places', '/collections'];

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, {
							...options,
							path: '/',
							maxAge: options?.maxAge ?? SESSION_MAX_AGE_SECONDS,
							httpOnly: false,
							secure: event.url.protocol === 'https:',
							sameSite: 'lax'
						});
					});
				}
			}
		}
	);

	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) {
			return { session: null, user: null };
		}

		return { session, user: session.user };
	};

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	if (!session && PROTECTED_ROUTES.some((r) => event.url.pathname.startsWith(r))) {
		const intended = event.url.pathname + event.url.search;
		const loginUrl = `/login?redirect=${encodeURIComponent(intended)}`;
		redirect(303, loginUrl);
	}

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
