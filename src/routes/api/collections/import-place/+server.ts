import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PLACE_COPY_FIELDS = [
	'title', 'note', 'url', 'tags', 'comment', 'source_list',
	'google_place_id', 'category', 'primary_type', 'rating', 'rating_count',
	'price_level', 'address', 'area', 'description', 'lat', 'lng',
	'phone', 'website', 'enriched_at'
] as const;

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user ?? locals.session?.user;
	if (!locals.session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	const sourceCollectionId = typeof body?.sourceCollectionId === 'string' ? body.sourceCollectionId.trim() : '';
	const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : '';
	const targetCollectionId = typeof body?.targetCollectionId === 'string' ? body.targetCollectionId.trim() : '';

	if (!sourceCollectionId || !placeId) {
		throw error(400, 'Missing sourceCollectionId or placeId');
	}

	const { data: source, error: colErr } = await locals.supabase
		.from('lists')
		.select('id, user_id, visibility')
		.eq('id', sourceCollectionId)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !source) {
		throw error(404, 'Source collection not found or is no longer shared');
	}

	const { data: linkRow } = await locals.supabase
		.from('list_places')
		.select('place_id')
		.eq('list_id', sourceCollectionId)
		.eq('place_id', placeId)
		.maybeSingle();

	if (!linkRow) {
		throw error(404, 'Place not found in this collection');
	}

	const { data: sourcePlace, error: placeErr } = await locals.supabase
		.from('places')
		.select('*')
		.eq('id', placeId)
		.eq('user_id', (source as any).user_id)
		.single();

	if (placeErr || !sourcePlace) {
		throw error(404, 'Place data not found');
	}

	const existingCheck = (sourcePlace as any).google_place_id
		? await locals.supabase
			.from('places')
			.select('id')
			.eq('user_id', user.id)
			.eq('google_place_id', (sourcePlace as any).google_place_id)
			.maybeSingle()
		: { data: null };

	if (existingCheck.data) {
		return json({
			id: (existingCheck.data as any).id,
			alreadyExists: true,
			title: (sourcePlace as any).title
		}, { status: 200 });
	}

	const row: Record<string, unknown> = { user_id: user.id };
	for (const field of PLACE_COPY_FIELDS) {
		if ((sourcePlace as any)[field] !== undefined) {
			row[field] = (sourcePlace as any)[field];
		}
	}
	row.source_list = 'shared-import';

	const { data: newPlace, error: insertErr } = await locals.supabase
		.from('places')
		.insert(row as any)
		.select('id, title')
		.single();

	if (insertErr || !newPlace) {
		throw error(500, 'Failed to import place');
	}

	if (targetCollectionId) {
		await locals.supabase
			.from('list_places')
			.insert({ list_id: targetCollectionId, place_id: (newPlace as any).id });
	}

	return json({
		id: (newPlace as any).id,
		title: (newPlace as any).title,
		alreadyExists: false
	}, { status: 201 });
};
