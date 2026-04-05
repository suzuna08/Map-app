import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Collection, Place, Tag } from '$lib/types/database';

export type CollectionMemberMap = Record<string, string[]>;

const LISTS_COLUMNS = 'id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at';

export async function loadCollections(supabase: SupabaseClient<Database>, userId?: string): Promise<{
	collections: Collection[];
	collectionPlacesMap: CollectionMemberMap;
}> {
	let query = supabase
		.from('lists')
		.select(`${LISTS_COLUMNS}, list_places(place_id)`)
		.order('created_at', { ascending: false });
	if (userId) query = query.eq('user_id', userId);

	const { data, error } = await query;

	if (error) console.error('[loadCollections] error:', error);

	const rows = (data ?? []) as (Collection & { list_places: { place_id: string }[] })[];
	const collectionPlacesMap: CollectionMemberMap = {};
	const collections = rows.map(({ list_places, ...col }) => {
		collectionPlacesMap[col.id] = list_places.map((lp) => lp.place_id);
		return col as Collection;
	});

	return { collections, collectionPlacesMap };
}

export async function createCollection(
	supabase: SupabaseClient<Database>,
	userId: string,
	name: string,
	opts?: { description?: string; color?: string; emoji?: string; placeIds?: string[] }
): Promise<Collection | null> {
	const { data, error } = await supabase
		.from('lists')
		.insert({
			user_id: userId,
			name,
			description: opts?.description ?? null,
			color: opts?.color ?? '#A5834F',
			emoji: opts?.emoji ?? null
		})
		.select(LISTS_COLUMNS)
		.single();

	if (error || !data) {
		console.error('[createCollection]', error);
		return null;
	}

	const collection = data as Collection;

	if (opts?.placeIds?.length) {
		const rows = opts.placeIds.map((place_id) => ({
			list_id: collection.id,
			place_id
		}));
		const { error: insertError } = await supabase.from('list_places').insert(rows);
		if (insertError) console.error('[createCollection] insert places error:', insertError);
	}

	return collection;
}

export async function updateCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	updates: { name?: string; description?: string | null; color?: string; emoji?: string | null; visibility?: string; share_slug?: string | null }
): Promise<boolean> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.description !== undefined) payload.description = updates.description;
	if (updates.color !== undefined) payload.color = updates.color;
	if (updates.emoji !== undefined) payload.emoji = updates.emoji;
	if (updates.visibility !== undefined) payload.visibility = updates.visibility;
	if (updates.share_slug !== undefined) payload.share_slug = updates.share_slug;

	const { error } = await supabase.from('lists').update(payload).eq('id', collectionId);
	if (error) {
		console.error('[updateCollection]', error);
		return false;
	}
	return true;
}

export async function deleteCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<boolean> {
	const { error } = await supabase.from('lists').delete().eq('id', collectionId);
	if (error) {
		console.error('[deleteCollection]', error);
		return false;
	}
	return true;
}

export async function addPlaceToCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	placeId: string
) {
	const { error } = await supabase
		.from('list_places')
		.insert({ list_id: collectionId, place_id: placeId });
	if (error) console.error('[addPlaceToCollection]', error);
}

export async function addPlacesToCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	placeIds: string[],
	existingMemberIds?: string[]
): Promise<{ added: number; skipped: number }> {
	if (placeIds.length === 0) return { added: 0, skipped: 0 };

	const existingSet = new Set(existingMemberIds ?? []);
	const newIds = existingMemberIds !== undefined
		? placeIds.filter((id) => !existingSet.has(id))
		: placeIds;
	const skipped = placeIds.length - newIds.length;

	if (newIds.length === 0) return { added: 0, skipped };

	const rows = newIds.map((place_id) => ({ list_id: collectionId, place_id }));
	const { error } = await supabase
		.from('list_places')
		.upsert(rows, { onConflict: 'list_id,place_id', ignoreDuplicates: true });
	if (error) {
		console.error('[addPlacesToCollection]', error);
		return { added: 0, skipped: 0 };
	}
	return { added: newIds.length, skipped };
}

export async function removePlaceFromCollection(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	placeId: string
) {
	const { error } = await supabase
		.from('list_places')
		.delete()
		.eq('list_id', collectionId)
		.eq('place_id', placeId);
	if (error) console.error('[removePlaceFromCollection]', error);
}

export function isPlaceInCollection(
	map: CollectionMemberMap,
	collectionId: string,
	placeId: string
): boolean {
	return (map[collectionId] ?? []).includes(placeId);
}

export function optimisticAdd(
	map: CollectionMemberMap,
	collectionId: string,
	placeId: string
): CollectionMemberMap {
	const current = map[collectionId] ?? [];
	if (current.includes(placeId)) return map;
	return { ...map, [collectionId]: [...current, placeId] };
}

export function optimisticRemove(
	map: CollectionMemberMap,
	collectionId: string,
	placeId: string
): CollectionMemberMap {
	const current = map[collectionId] ?? [];
	return { ...map, [collectionId]: current.filter((id) => id !== placeId) };
}

export function generateShareSlug(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let slug = '';
	for (let i = 0; i < 10; i++) {
		slug += chars[Math.floor(Math.random() * chars.length)];
	}
	return slug;
}

export async function enableSharing(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<string | null> {
	const slug = generateShareSlug();
	const ok = await updateCollection(supabase, collectionId, {
		visibility: 'link_access',
		share_slug: slug
	});
	return ok ? slug : null;
}

export async function disableSharing(
	supabase: SupabaseClient<Database>,
	collectionId: string
): Promise<boolean> {
	return updateCollection(supabase, collectionId, {
		visibility: 'private',
		share_slug: null
	});
}

export async function loadCollectionBySlug(
	supabase: SupabaseClient<Database>,
	slug: string
): Promise<{ collection: Collection; placeIds: string[] } | null> {
	const { data: raw, error } = await supabase
		.from('lists')
		.select(`${LISTS_COLUMNS}, list_places(place_id)`)
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (error || !raw) return null;

	const { list_places, ...col } = raw as any;
	return {
		collection: col as Collection,
		placeIds: (list_places as { place_id: string }[]).map((lp) => lp.place_id)
	};
}

const PLACE_COLUMNS = 'id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at';

export interface CollectionBrowseData {
	places: Place[];
	tags: Tag[];
	placeTags: { place_id: string; tag_id: string }[];
}

export async function loadCollectionPlaces(
	supabase: SupabaseClient<Database>,
	collectionId: string,
	userId: string
): Promise<CollectionBrowseData> {
	const [colRes, tagsRes] = await Promise.all([
		supabase
			.from('lists')
			.select(`id, list_places(place_id, places(${PLACE_COLUMNS}, place_tags(tag_id)))`)
			.eq('id', collectionId)
			.eq('user_id', userId)
			.single(),
		supabase
			.from('tags')
			.select('id, user_id, name, color, source, created_at, order_index')
			.eq('user_id', userId)
			.order('name')
	]);

	if (colRes.error || !colRes.data) {
		return { places: [], tags: [], placeTags: [] };
	}

	const listPlaces = (colRes.data as any).list_places as any[];
	const placeTags: { place_id: string; tag_id: string }[] = [];
	const places: Place[] = [];

	for (const lp of listPlaces) {
		const p = lp.places;
		if (!p) continue;
		const { place_tags, ...placeData } = p;
		places.push(placeData as Place);
		for (const pt of (place_tags as { tag_id: string }[])) {
			placeTags.push({ place_id: placeData.id, tag_id: pt.tag_id });
		}
	}

	return {
		places,
		tags: (tagsRes.data ?? []) as Tag[],
		placeTags
	};
}
