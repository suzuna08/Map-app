import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const [listsRes] = await Promise.all([
		supabase
			.from('lists')
			.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at')
			.eq('user_id', userId!)
			.order('updated_at', { ascending: false })
	]);

	const listIds = (listsRes.data ?? []).map((l) => l.id);
	const listPlacesRes = listIds.length > 0
		? await supabase.from('list_places').select('list_id, place_id').in('list_id', listIds)
		: { data: [] as { list_id: string; place_id: string }[] };

	const collectionPlacesMap: Record<string, string[]> = {};
	for (const row of listPlacesRes.data ?? []) {
		(collectionPlacesMap[row.list_id] ??= []).push(row.place_id);
	}

	return {
		collections: listsRes.data ?? [],
		collectionPlacesMap
	};
};
