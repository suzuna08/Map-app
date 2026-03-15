import type { SupabaseClient } from '@supabase/supabase-js';

const CATEGORY_COLOR = '#6b7280';
const AREA_COLOR = '#3b82f6';

async function findOrCreateTag(
	supabase: SupabaseClient,
	userId: string,
	name: string,
	source: 'category' | 'area',
	color: string
): Promise<string | null> {
	const { data: existing } = await supabase
		.from('tags')
		.select('id')
		.eq('user_id', userId)
		.eq('name', name)
		.eq('source', source)
		.single();

	if (existing) return (existing as { id: string }).id;

	const { data: created } = await supabase
		.from('tags')
		.insert({ user_id: userId, name, color, source })
		.select('id')
		.single();

	return created ? (created as { id: string }).id : null;
}

async function linkTagToPlace(
	supabase: SupabaseClient,
	placeId: string,
	tagId: string
): Promise<void> {
	const { data: existing } = await supabase
		.from('place_tags')
		.select('id')
		.eq('place_id', placeId)
		.eq('tag_id', tagId)
		.single();

	if (!existing) {
		await supabase.from('place_tags').insert({ place_id: placeId, tag_id: tagId });
	}
}

export async function upsertSystemTags(
	supabase: SupabaseClient,
	userId: string,
	placeId: string,
	category: string | null | undefined,
	area: string | null | undefined
): Promise<void> {
	if (category) {
		const tagId = await findOrCreateTag(supabase, userId, category, 'category', CATEGORY_COLOR);
		if (tagId) await linkTagToPlace(supabase, placeId, tagId);
	}

	if (area) {
		const tagId = await findOrCreateTag(supabase, userId, area, 'area', AREA_COLOR);
		if (tagId) await linkTagToPlace(supabase, placeId, tagId);
	}
}
