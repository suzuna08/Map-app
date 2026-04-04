import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;
	const collectionId = params.id;

	const [colRes, tagsRes, allPlacesRes] = await Promise.all([
		supabase
			.from('lists')
			.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at, list_places(place_id, places(id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at))')
			.eq('id', collectionId)
			.eq('user_id', userId!)
			.single(),
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase
			.from('places')
			.select('id, title, area, category, user_rating, place_tags(tag_id)')
			.eq('user_id', userId!)
			.order('created_at', { ascending: false })
	]);

	if (colRes.error || !colRes.data) {
		error(404, 'Collection not found');
	}

	const { list_places, ...collection } = colRes.data as any;
	const places = (list_places as any[]).map((lp: any) => lp.places).filter(Boolean);
	const placeIds = (list_places as any[]).map((lp: any) => lp.place_id);

	const placeTags: { place_id: string; tag_id: string }[] = [];
	const allPlaces = ((allPlacesRes.data ?? []) as any[]).map(({ place_tags, ...p }) => {
		for (const pt of (place_tags as { tag_id: string }[])) {
			placeTags.push({ place_id: p.id, tag_id: pt.tag_id });
		}
		return p;
	});

	return {
		collection,
		places,
		placeIds,
		tags: tagsRes.data ?? [],
		placeTags,
		allPlaces
	};
};
