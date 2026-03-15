import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database';

declare global {
	namespace App {
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{ session: Session | null; user: import('@supabase/supabase-js').User | null }>;
			session: Session | null;
			user: import('@supabase/supabase-js').User | null;
		}
		interface PageData {
			session: Session | null;
			supabase: SupabaseClient<Database>;
		}
	}
}

export {};
