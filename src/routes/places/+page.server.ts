import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id ?? locals.session?.user?.id;

	const [placesRes, tagsRes, placeTagsRes, listsRes, listPlacesRes] = await Promise.all([
		supabase.from('places').select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at').eq('user_id', userId!).order('created_at', { ascending: false }),
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase.from('place_tags').select('place_id, tag_id'),
		supabase.from('lists').select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at').eq('user_id', userId!).order('created_at', { ascending: false }),
		supabase.from('list_places').select('list_id, place_id')
	]);

	return {
		serverPlaces: placesRes.data ?? [],
		serverTags: tagsRes.data ?? [],
		serverPlaceTags: placeTagsRes.data ?? [],
		serverCollections: listsRes.data ?? [],
		serverListPlaces: listPlacesRes.data ?? []
	};
};
