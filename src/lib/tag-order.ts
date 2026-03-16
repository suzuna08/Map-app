import type { SupabaseClient } from '@supabase/supabase-js';

export async function getNextOrderIndex(supabase: SupabaseClient, userId: string): Promise<number> {
	const { data } = await supabase
		.from('tags')
		.select('order_index')
		.eq('user_id', userId)
		.eq('source', 'user')
		.order('order_index', { ascending: false })
		.limit(1)
		.single();

	return ((data as { order_index: number } | null)?.order_index ?? -1) + 1;
}

export async function saveTagOrder(supabase: SupabaseClient, tagIds: string[]): Promise<void> {
	const updates = tagIds.map((id, index) =>
		supabase.from('tags').update({ order_index: index }).eq('id', id)
	);
	await Promise.all(updates);
}

export async function reindexAfterDelete(supabase: SupabaseClient, userId: string): Promise<void> {
	const { data } = await supabase
		.from('tags')
		.select('id')
		.eq('user_id', userId)
		.eq('source', 'user')
		.order('order_index', { ascending: true });

	if (!data || data.length === 0) return;

	const updates = (data as { id: string }[]).map((tag, index) =>
		supabase.from('tags').update({ order_index: index }).eq('id', tag.id)
	);
	await Promise.all(updates);
}
