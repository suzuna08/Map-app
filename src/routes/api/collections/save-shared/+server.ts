import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user ?? locals.session?.user;
	if (!locals.session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	const collectionId = typeof body?.collectionId === 'string' ? body.collectionId.trim() : '';
	if (!collectionId) {
		throw error(400, 'Missing collectionId');
	}

	const { data: source, error: colErr } = await locals.supabase
		.from('lists')
		.select('id, user_id, name, visibility')
		.eq('id', collectionId)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !source) {
		throw error(404, 'Collection not found or is private');
	}

	if ((source as any).user_id === user.id) {
		throw error(409, 'You already own this collection');
	}

	const { data: existing } = await locals.supabase
		.from('saved_collections')
		.select('id')
		.eq('user_id', user.id)
		.eq('source_list_id', collectionId)
		.maybeSingle();

	if (existing) {
		throw error(409, 'Collection already saved');
	}

	const { data: bookmark, error: insertErr } = await locals.supabase
		.from('saved_collections')
		.insert({
			user_id: user.id,
			source_list_id: collectionId
		})
		.select('id')
		.single();

	if (insertErr || !bookmark) {
		throw error(500, 'Failed to save collection');
	}

	return json({
		id: (bookmark as any).id,
		sourceCollectionId: collectionId,
		name: (source as any).name
	}, { status: 201 });
};
