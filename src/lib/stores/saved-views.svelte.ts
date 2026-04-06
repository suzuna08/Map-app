import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, SavedView, SavedViewFilters, TagGroup } from '$lib/types/database';

const SAVED_VIEWS_COLUMNS = 'id, user_id, name, filters_json, sort_by, layout_mode, order_index, created_at, updated_at';

export async function loadSavedViews(supabase: SupabaseClient<Database>, userId?: string): Promise<SavedView[]> {
	let query = supabase
		.from('saved_views')
		.select(SAVED_VIEWS_COLUMNS)
		.order('order_index', { ascending: true })
		.order('created_at', { ascending: true });
	if (userId) query = query.eq('user_id', userId);
	const { data, error } = await query;
	if (error) console.error('[loadSavedViews]', error);
	return (data ?? []) as SavedView[];
}

export async function createSavedView(
	supabase: SupabaseClient<Database>,
	userId: string,
	name: string,
	filtersJson: SavedViewFilters,
	sortBy: string,
	layoutMode: string
): Promise<SavedView | null> {
	const { data, error } = await supabase
		.from('saved_views')
		.insert({
			user_id: userId,
			name,
			filters_json: filtersJson as unknown as Record<string, unknown>,
			sort_by: sortBy,
			layout_mode: layoutMode
		})
		.select(SAVED_VIEWS_COLUMNS)
		.single();
	if (error) {
		console.error('[createSavedView]', error);
		return null;
	}
	return data as SavedView;
}

export async function updateSavedView(
	supabase: SupabaseClient<Database>,
	viewId: string,
	updates: {
		name?: string;
		filtersJson?: SavedViewFilters;
		sortBy?: string;
		layoutMode?: string;
		orderIndex?: number;
	}
): Promise<boolean> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.filtersJson !== undefined) payload.filters_json = updates.filtersJson;
	if (updates.sortBy !== undefined) payload.sort_by = updates.sortBy;
	if (updates.layoutMode !== undefined) payload.layout_mode = updates.layoutMode;
	if (updates.orderIndex !== undefined) payload.order_index = updates.orderIndex;

	const { error } = await supabase
		.from('saved_views')
		.update(payload)
		.eq('id', viewId);
	if (error) {
		console.error('[updateSavedView]', error);
		return false;
	}
	return true;
}

export async function deleteSavedView(
	supabase: SupabaseClient<Database>,
	viewId: string
): Promise<boolean> {
	const { error } = await supabase
		.from('saved_views')
		.delete()
		.eq('id', viewId);
	if (error) {
		console.error('[deleteSavedView]', error);
		return false;
	}
	return true;
}

export function buildFiltersSnapshot(
	selectedCustomIds: string[],
	selectedSource: string,
	tagGroups?: TagGroup[],
	searchText?: string
): SavedViewFilters {
	const filters: SavedViewFilters = {};
	if (selectedCustomIds.length > 0) filters.customTagIds = [...selectedCustomIds];
	if (tagGroups && tagGroups.length > 0) {
		filters.tagGroups = tagGroups.map((g) => ({ id: g.id, tagIds: [...g.tagIds], mode: g.mode }));
	}
	if (selectedSource !== 'all') filters.source = selectedSource;
	if (searchText) filters.searchText = searchText;
	return filters;
}

export async function reorderSavedViews(
	supabase: SupabaseClient<Database>,
	orderedIds: string[]
): Promise<boolean> {
	const rows = orderedIds.map((id, index) => ({ id, order_index: index }));
	const { error } = await supabase.from('saved_views').upsert(rows, { onConflict: 'id' });
	if (error) console.error('[reorderSavedViews] upsert failed', error);
	return !error;
}
