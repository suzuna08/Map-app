import type { SupabaseClient } from '@supabase/supabase-js';

export async function getNextOrderIndex(supabase: SupabaseClient, userId: string): Promise<number | null> {
	try {
		const { data, error } = await supabase
			.from('tags')
			.select('order_index')
			.eq('user_id', userId)
			.eq('source', 'user')
			.order('order_index', { ascending: false })
			.limit(1)
			.single();

		if (error || !data) return null;
		return ((data as { order_index: number }).order_index ?? -1) + 1;
	} catch {
		return null;
	}
}

export async function saveTagOrder(supabase: SupabaseClient, tagIds: string[]): Promise<void> {
	try {
		const updates = tagIds.map((id, index) =>
			supabase.from('tags').update({ order_index: index }).eq('id', id)
		);
		await Promise.all(updates);
	} catch {
		// order_index column may not exist yet
	}
}

export async function reindexAfterDelete(supabase: SupabaseClient, userId: string): Promise<void> {
	try {
		const { data } = await supabase
			.from('tags')
			.select('id, order_index')
			.eq('user_id', userId)
			.eq('source', 'user')
			.order('order_index', { ascending: true });

		if (!data || data.length === 0) return;

		const updates = (data as { id: string }[]).map((tag, index) =>
			supabase.from('tags').update({ order_index: index }).eq('id', tag.id)
		);
		await Promise.all(updates);
	} catch {
		// order_index column may not exist yet
	}
}
