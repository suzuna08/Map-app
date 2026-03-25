import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Collection } from '$lib/types/database';

export type CollectionMemberMap = Record<string, string[]>;

export async function loadCollections(supabase: SupabaseClient<Database>): Promise<{
	collections: Collection[];
	collectionPlacesMap: CollectionMemberMap;
}> {
	const [colRes, membersRes] = await Promise.all([
		supabase.from('lists').select('id, user_id, name, description, color, created_at, updated_at').order('created_at', { ascending: false }),
		supabase.from('list_places').select('list_id, place_id')
	]);

	if (colRes.error) console.error('[loadCollections] lists error:', colRes.error);
	if (membersRes.error) console.error('[loadCollections] list_places error:', membersRes.error);

	const collections = (colRes.data ?? []) as Collection[];
	const collectionPlacesMap: CollectionMemberMap = {};

	for (const row of membersRes.data ?? []) {
		(collectionPlacesMap[row.list_id] ??= []).push(row.place_id);
	}

	return { collections, collectionPlacesMap };
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
