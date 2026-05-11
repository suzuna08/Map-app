import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const [listsRes, photosRes, savedRes] = await Promise.all([
		supabase
			.from('lists')
			.select('*, list_places(place_id)')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true }),
		supabase
			.from('place_photos')
			.select('place_id, storage_path, sort_order')
			.eq('user_id', userId!)
			.order('sort_order', { ascending: true })
			.order('created_at', { ascending: true }),
		supabase
			.from('saved_collections')
			.select('id, source_list_id, saved_at')
			.eq('user_id', userId!)
			.order('saved_at', { ascending: false })
	]);

	const rows = (listsRes.data ?? []) as any[];
	const collectionPlacesMap: Record<string, string[]> = {};
	const collections = rows.map(({ list_places, ...col }: any) => {
		collectionPlacesMap[col.id] = (list_places as { place_id: string }[]).map((lp) => lp.place_id);
		return col;
	});

	const placePhotos: Record<string, string[]> = {};
	for (const row of (photosRes.data ?? []) as { place_id: string; storage_path: string }[]) {
		const { data: { publicUrl } } = supabase.storage.from('place-photos').getPublicUrl(row.storage_path);
		(placePhotos[row.place_id] ??= []).push(publicUrl);
	}

	// Fetch source collection details for saved bookmarks
	const savedRows = (savedRes.data ?? []) as { id: string; source_list_id: string; saved_at: string }[];
	let savedCollections: { id: string; source_list_id: string; saved_at: string; source_collection: any | null; placeCount: number }[] = [];

	if (savedRows.length > 0) {
		const sourceIds = savedRows.map((r) => r.source_list_id);
		const { data: sourceLists } = await supabase
			.from('lists')
			.select('id, user_id, name, description, color, emoji, visibility, share_slug, share_notes, share_photos, share_tags, sort_order, created_at, updated_at, list_places(place_id)')
			.in('id', sourceIds)
			.eq('visibility', 'link_access');

		const sourceMap = new Map<string, any>();
		for (const list of (sourceLists ?? []) as any[]) {
			sourceMap.set(list.id, list);
		}

		savedCollections = savedRows.map((row) => {
			const source = sourceMap.get(row.source_list_id);
			return {
				id: row.id,
				source_list_id: row.source_list_id,
				saved_at: row.saved_at,
				source_collection: source ? { ...source, list_places: undefined } : null,
				placeCount: source ? (source.list_places?.length ?? 0) : 0,
			};
		});
	}

	return { collections, collectionPlacesMap, placePhotos, savedCollections };
};
