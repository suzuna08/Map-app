import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;
	const collectionId = params.id;

	const [colRes, tagsRes, photosRes] = await Promise.all([
		supabase
			.from('lists')
			.select('*, list_places(place_id, places(id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at))')
			.eq('id', collectionId)
			.eq('user_id', userId!)
			.single(),
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase
			.from('place_photos')
			.select('place_id, storage_path, sort_order')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true })
	]);

	if (colRes.error || !colRes.data) {
		error(404, 'Collection not found');
	}

	const { list_places, ...collection } = colRes.data as any;
	const places = (list_places as any[]).map((lp: any) => lp.places).filter(Boolean);
	const placeIds = (list_places as any[]).map((lp: any) => lp.place_id);

	const placePhotos: Record<string, string[]> = {};
	for (const row of (photosRes.data ?? []) as { place_id: string; storage_path: string }[]) {
		const { data: { publicUrl } } = supabase.storage.from('place-photos').getPublicUrl(row.storage_path);
		(placePhotos[row.place_id] ??= []).push(publicUrl);
	}

	return {
		collection,
		places,
		placeIds,
		tags: tagsRes.data ?? [],
		placePhotos
	};
};
