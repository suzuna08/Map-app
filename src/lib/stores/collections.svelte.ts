import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Collection } from '$lib/types/database';

export type CollectionMemberMap = Record<string, string[]>;

const LISTS_COLUMNS = 'id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at';

export async function loadCollections(supabase: SupabaseClient<Database>): Promise<{
	collections: Collection[];
	collectionPlacesMap: CollectionMemberMap;
}> {
	const [colRes, membersRes] = await Promise.all([
		supabase.from('lists').select(LISTS_COLUMNS).order('created_at', { ascending: false }),
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
	updates: { name?: string; description?: string; color?: string; emoji?: string | null; visibility?: string; share_slug?: string }
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
		share_slug: undefined
	});
}

export async function loadCollectionBySlug(
	supabase: SupabaseClient<Database>,
	slug: string
): Promise<{ collection: Collection; placeIds: string[] } | null> {
	const { data: col, error } = await supabase
		.from('lists')
		.select(LISTS_COLUMNS)
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (error || !col) return null;

	const collection = col as Collection;
	const { data: members } = await supabase
		.from('list_places')
		.select('place_id')
		.eq('list_id', collection.id);

	return {
		collection,
		placeIds: (members ?? []).map((m) => m.place_id)
	};
}
