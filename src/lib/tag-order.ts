import type { SupabaseClient } from '@supabase/supabase-js';

export async function getNextOrderIndex(supabase: SupabaseClient, userId: string): Promise<number> {
	const { data, error } = await supabase
		.from('tags')
		.select('order_index')
		.eq('user_id', userId)
		.eq('source', 'user')
		.not('order_index', 'is', null)
		.order('order_index', { ascending: false })
		.limit(1);

	if (error || !data || data.length === 0) return 0;
	return ((data[0] as { order_index: number }).order_index ?? -1) + 1;
}

export interface SaveTagOrderResult {
	ok: boolean;
	failedIds?: string[];
}

export async function saveTagOrder(
	supabase: SupabaseClient,
	tagIds: string[]
): Promise<SaveTagOrderResult> {
	const results = await Promise.all(
		tagIds.map(async (id, index) => {
			const { error } = await supabase
				.from('tags')
				.update({ order_index: index })
				.eq('id', id);
			return { id, error };
		})
	);

	const failed = results.filter((r) => r.error);
	if (failed.length > 0) {
		console.error('[tag-order] saveTagOrder failed for ids:', failed.map((f) => f.id), failed.map((f) => f.error));
		return { ok: false, failedIds: failed.map((f) => f.id) };
	}
	return { ok: true };
}

export async function reindexAfterDelete(supabase: SupabaseClient, userId: string): Promise<void> {
	const { data, error } = await supabase
		.from('tags')
		.select('id, order_index')
		.eq('user_id', userId)
		.eq('source', 'user')
		.order('order_index', { ascending: true });

	if (error || !data || data.length === 0) return;

	const updates = (data as { id: string }[]).map((tag, index) =>
		supabase.from('tags').update({ order_index: index }).eq('id', tag.id)
	);
	await Promise.all(updates);
}
