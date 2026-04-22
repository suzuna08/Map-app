import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Place, Tag } from '$lib/types/database';

const PLACES_COLUMNS = 'id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at';
const TAGS_COLUMNS = 'id, user_id, name, color, source, created_at, order_index';

export async function loadPlacesData(supabase: SupabaseClient<Database>, userId?: string) {
	let placesQuery = supabase.from('places').select(`${PLACES_COLUMNS}, place_tags(tag_id)`);
	let tagsQuery = supabase.from('tags').select(TAGS_COLUMNS);
	if (userId) {
		placesQuery = placesQuery.eq('user_id', userId);
		tagsQuery = tagsQuery.eq('user_id', userId);
	}
	const [placesRes, tagsRes] = await Promise.all([
		placesQuery.order('created_at', { ascending: false }),
		tagsQuery.order('name')
	]);

	const placeTags: { place_id: string; tag_id: string }[] = [];
	const places = ((placesRes.data ?? []) as (Place & { place_tags: { tag_id: string }[] })[]).map(
		({ place_tags, ...p }) => {
			for (const pt of place_tags) {
				placeTags.push({ place_id: p.id, tag_id: pt.tag_id });
			}
			return p as Place;
		}
	);

	return {
		places,
		tags: (tagsRes.data ?? []) as Tag[],
		placeTags
	};
}

export async function refreshTagsData(supabase: SupabaseClient<Database>, userId?: string) {
	let tagsQuery = supabase.from('tags').select(TAGS_COLUMNS);
	let placesQuery = supabase.from('places').select('id, place_tags(tag_id)');
	if (userId) {
		tagsQuery = tagsQuery.eq('user_id', userId);
		placesQuery = placesQuery.eq('user_id', userId);
	}
	const [tagsRes, placesRes] = await Promise.all([
		tagsQuery.order('name'),
		placesQuery
	]);

	const placeTags: { place_id: string; tag_id: string }[] = [];
	for (const row of (placesRes.data ?? []) as { id: string; place_tags: { tag_id: string }[] }[]) {
		for (const pt of row.place_tags) {
			placeTags.push({ place_id: row.id, tag_id: pt.tag_id });
		}
	}

	return {
		tags: (tagsRes.data ?? []) as Tag[],
		placeTags
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
	if (tagIds.length === 0) return;
	await supabase
		.from('place_tags')
		.delete()
		.eq('place_id', placeId)
		.in('tag_id', tagIds);
}

export async function applyTagsToPlace(
	supabase: SupabaseClient<Database>,
	placeId: string,
	tagIds: string[]
) {
	if (tagIds.length === 0) return;
	const rows = tagIds.map((tag_id) => ({ place_id: placeId, tag_id }));
	const { error } = await supabase
		.from('place_tags')
		.upsert(rows, { onConflict: 'place_id,tag_id', ignoreDuplicates: true });
	if (error) console.error('[applyTagsToPlace]', error);
}

export async function applyTagToPlaces(
	supabase: SupabaseClient<Database>,
	tagId: string,
	placeIds: string[]
) {
	if (placeIds.length === 0) return;
	const rows = placeIds.map((place_id) => ({ place_id, tag_id: tagId }));
	const { error } = await supabase
		.from('place_tags')
		.upsert(rows, { onConflict: 'place_id,tag_id', ignoreDuplicates: true });
	if (error) console.error('[applyTagToPlaces]', error);
}
