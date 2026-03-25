import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const slug = params.slug;

	const { data: collection, error: colErr } = await supabase
		.from('lists')
		.select('id, user_id, name, description, color, visibility, share_slug, created_at, updated_at')
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !collection) {
		error(404, 'Collection not found or is private');
	}

	const { data: memberRows } = await supabase
		.from('list_places')
		.select('place_id')
		.eq('list_id', collection.id);

	const placeIds = (memberRows ?? []).map((r) => r.place_id);

	let places: unknown[] = [];
	if (placeIds.length > 0) {
		const { data } = await supabase
			.from('places')
			.select('id, title, url, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website')
			.in('id', placeIds);
		places = data ?? [];
	}

	return {
		collection,
		places
	};
};
