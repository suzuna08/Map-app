import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const [placesRes, tagsRes, listsRes] = await Promise.all([
		supabase
			.from('places')
			.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at, place_tags(tag_id)')
			.eq('user_id', userId!)
			.order('created_at', { ascending: false }),
		supabase.from('tags').select('id, user_id, name, color, source, created_at, order_index').eq('user_id', userId!).order('name'),
		supabase
			.from('lists')
			.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at, list_places(place_id)')
			.eq('user_id', userId!)
			.order('created_at', { ascending: false })
	]);

	let photosRes: { data: any[] | null; error: any } = { data: [], error: null };
	try {
		photosRes = await supabase
			.from('place_photos')
			.select('place_id, storage_path, sort_order')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true });
	} catch {
		// place_photos table may not exist yet
	}

	const placeTags: { place_id: string; tag_id: string }[] = [];
	const places = (placesRes.data ?? []).map(({ place_tags, ...p }) => {
		for (const pt of (place_tags as { tag_id: string }[])) {
			placeTags.push({ place_id: p.id, tag_id: pt.tag_id });
		}
		return p;
	});

	const listPlaces: { list_id: string; place_id: string }[] = [];
	const collections = (listsRes.data ?? []).map(({ list_places, ...col }) => {
		for (const lp of (list_places as { place_id: string }[])) {
			listPlaces.push({ list_id: col.id, place_id: lp.place_id });
		}
		return col;
	});

	const placePhotos: Record<string, string[]> = {};
	for (const row of (photosRes.data ?? []) as { place_id: string; storage_path: string }[]) {
		const { data: { publicUrl } } = supabase.storage.from('place-photos').getPublicUrl(row.storage_path);
		(placePhotos[row.place_id] ??= []).push(publicUrl);
	}

	return {
		serverPlaces: places,
		serverTags: tagsRes.data ?? [],
		serverPlaceTags: placeTags,
		serverCollections: collections,
		serverListPlaces: listPlaces,
		placePhotos
	};
};
