import { redirect, type RequestHandler } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const token_hash = url.searchParams.get('token_hash');
	const type = url.searchParams.get('type') as EmailOtpType | null;
	const next = url.searchParams.get('next') ?? '/login';

	if (token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ type, token_hash });

		if (!error) {
			redirect(303, next);
		}
	}

	redirect(303, '/login?error=invalid-confirmation-link');
};
