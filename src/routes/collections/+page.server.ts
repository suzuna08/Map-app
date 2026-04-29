import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const [listsRes, photosRes] = await Promise.all([
		supabase
			.from('lists')
			.select('id, user_id, name, description, color, emoji, visibility, share_slug, sort_order, created_at, updated_at, list_places(place_id)')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true }),
		supabase
			.from('place_photos')
			.select('place_id, storage_path, sort_order')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true })
	]);

	const rows = listsRes.data ?? [];
	const collectionPlacesMap: Record<string, string[]> = {};
	const collections = rows.map(({ list_places, ...col }) => {
		collectionPlacesMap[col.id] = (list_places as { place_id: string }[]).map((lp) => lp.place_id);
		return col;
	});

	const placePhotos: Record<string, string[]> = {};
	for (const row of (photosRes.data ?? []) as { place_id: string; storage_path: string }[]) {
		const { data: { publicUrl } } = supabase.storage.from('place-photos').getPublicUrl(row.storage_path);
		(placePhotos[row.place_id] ??= []).push(publicUrl);
	}

	return { collections, collectionPlacesMap, placePhotos };
};
