import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	const { data } = await supabase
		.from('lists')
		.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at, list_places(place_id)')
		.eq('user_id', userId!)
		.order('updated_at', { ascending: false });

	const rows = data ?? [];
	const collectionPlacesMap: Record<string, string[]> = {};
	const collections = rows.map(({ list_places, ...col }) => {
		collectionPlacesMap[col.id] = (list_places as { place_id: string }[]).map((lp) => lp.place_id);
		return col;
	});

	return { collections, collectionPlacesMap };
};
