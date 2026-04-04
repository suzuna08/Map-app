import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const slug = params.slug;

	const { data: raw, error: colErr } = await supabase
		.from('lists')
		.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at, list_places(place_id, places(id, title, note, url, category, primary_type, rating, rating_count, price_level, address, area, lat, lng, phone, user_rating))')
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !raw) {
		error(404, 'Collection not found or is private');
	}

	const { list_places, ...collection } = raw as any;
	const places = (list_places as any[]).map((lp: any) => lp.places).filter(Boolean);

	return {
		collection,
		places
	};
};
