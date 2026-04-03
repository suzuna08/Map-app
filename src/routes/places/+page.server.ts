import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const [placesRes, tagsRes, listsRes] = await Promise.all([
		supabase.from('places').select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at').eq('user_id', userId!).order('created_at', { ascending: false }),
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase.from('lists').select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at').eq('user_id', userId!).order('created_at', { ascending: false })
	]);

	const placeIds = (placesRes.data ?? []).map((p) => p.id);
	const listIds = (listsRes.data ?? []).map((l) => l.id);

	const [placeTagsRes, listPlacesRes] = await Promise.all([
		placeIds.length > 0
			? supabase.from('place_tags').select('place_id, tag_id').in('place_id', placeIds)
			: Promise.resolve({ data: [] as { place_id: string; tag_id: string }[] }),
		listIds.length > 0
			? supabase.from('list_places').select('list_id, place_id').in('list_id', listIds)
			: Promise.resolve({ data: [] as { list_id: string; place_id: string }[] })
	]);

	return {
		serverPlaces: placesRes.data ?? [],
		serverTags: tagsRes.data ?? [],
		serverPlaceTags: placeTagsRes.data ?? [],
		serverCollections: listsRes.data ?? [],
		serverListPlaces: listPlacesRes.data ?? []
	};
};
