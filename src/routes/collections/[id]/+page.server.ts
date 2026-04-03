import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;
	const collectionId = params.id;

	const { data: collection, error: colErr } = await supabase
		.from('lists')
		.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at')
		.eq('id', collectionId)
		.eq('user_id', userId!)
		.single();

	if (colErr || !collection) {
		error(404, 'Collection not found');
	}

	const { data: memberRows } = await supabase
		.from('list_places')
		.select('place_id')
		.eq('list_id', collectionId);

	const placeIds = (memberRows ?? []).map((r) => r.place_id);

	let places: unknown[] = [];
	if (placeIds.length > 0) {
		const { data } = await supabase
			.from('places')
			.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at')
			.in('id', placeIds);
		places = data ?? [];
	}

	const [tagsRes, allPlacesRes] = await Promise.all([
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase
			.from('places')
			.select('id, title, area, category, user_rating')
			.eq('user_id', userId!)
			.order('created_at', { ascending: false })
	]);

	const allUserPlaceIds = (allPlacesRes.data ?? []).map((p) => p.id);
	const placeTagsRes = allUserPlaceIds.length > 0
		? await supabase.from('place_tags').select('place_id, tag_id').in('place_id', allUserPlaceIds)
		: { data: [] as { place_id: string; tag_id: string }[] };

	return {
		collection,
		places,
		placeIds,
		tags: tagsRes.data ?? [],
		placeTags: placeTagsRes.data ?? [],
		allPlaces: allPlacesRes.data ?? []
	};
};
