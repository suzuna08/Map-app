import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './types/database';

export function createSupabaseClient(
	fetch?: typeof globalThis.fetch,
	serverCookies?: { get: (key: string) => string | undefined; set: (key: string, value: string, options: object) => void }
) {
	if (isBrowser()) {
		return createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
			global: { fetch }
		});
	}

	return createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: { fetch },
		cookies: {
			getAll() {
				return [];
			},
			setAll() {}
		}
	});
}
