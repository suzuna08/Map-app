import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Place, Tag } from '$lib/types/database';

const PLACES_COLUMNS = 'id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at';
const TAGS_COLUMNS = 'id, user_id, name, color, source, created_at, order_index';

export async function loadPlacesData(supabase: SupabaseClient<Database>) {
	const [placesRes, tagsRes, placeTagsRes] = await Promise.all([
		supabase.from('places').select(PLACES_COLUMNS).order('created_at', { ascending: false }),
		supabase.from('tags').select(TAGS_COLUMNS).order('name'),
		supabase.from('place_tags').select('place_id, tag_id')
	]);
	return {
		places: (placesRes.data ?? []) as Place[],
		tags: (tagsRes.data ?? []) as Tag[],
		placeTags: (placeTagsRes.data ?? []) as { place_id: string; tag_id: string }[]
	};
}

export async function refreshTagsData(supabase: SupabaseClient<Database>) {
	const [tagsRes, placeTagsRes] = await Promise.all([
		supabase.from('tags').select(TAGS_COLUMNS).order('name'),
		supabase.from('place_tags').select('place_id, tag_id')
	]);
	return {
		tags: (tagsRes.data ?? []) as Tag[],
		placeTags: (placeTagsRes.data ?? []) as { place_id: string; tag_id: string }[]
	};
}

export function buildPlaceTagsMap(
	allTags: Tag[],
	ptData: { place_id: string; tag_id: string }[]
): Record<string, Tag[]> {
	const tagById = new Map(allTags.map((t) => [t.id, t]));
	const map: Record<string, Tag[]> = {};
	for (const pt of ptData) {
		const tag = tagById.get(pt.tag_id);
		if (tag) {
			(map[pt.place_id] ??= []).push(tag);
		}
	}
	for (const tags of Object.values(map)) {
		tags.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
	}
	return map;
}

export async function removeTagsFromPlace(
	supabase: SupabaseClient<Database>,
	placeId: string,
	tagIds: string[]
) {
	await Promise.all(
		tagIds.map((tagId) =>
			supabase.from('place_tags').delete().eq('place_id', placeId).eq('tag_id', tagId)
		)
	);
}

export async function applyTagsToPlace(
	supabase: SupabaseClient<Database>,
	placeId: string,
	tagIds: string[]
) {
	await Promise.all(
		tagIds.map(async (tagId) => {
			const { data: existing } = await supabase
				.from('place_tags')
				.select('id')
				.eq('place_id', placeId)
				.eq('tag_id', tagId)
				.single();
			if (!existing) {
				await supabase.from('place_tags').insert({ place_id: placeId, tag_id: tagId });
			}
		})
	);
}
