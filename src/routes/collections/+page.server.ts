import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;

	const [listsRes, listPlacesRes] = await Promise.all([
		supabase
			.from('lists')
			.select('id, user_id, name, description, color, visibility, share_slug, created_at, updated_at')
			.order('updated_at', { ascending: false }),
		supabase.from('list_places').select('list_id, place_id')
	]);

	const collectionPlacesMap: Record<string, string[]> = {};
	for (const row of listPlacesRes.data ?? []) {
		(collectionPlacesMap[row.list_id] ??= []).push(row.place_id);
	}

	return {
		collections: listsRes.data ?? [],
		collectionPlacesMap
	};
};
