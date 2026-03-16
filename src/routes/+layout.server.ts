import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		session: locals.session,
		maptilerKey: env.PUBLIC_MAPTILER_KEY ?? ''
	};
};
