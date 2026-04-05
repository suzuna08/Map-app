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
	const collectionId = typeof body?.collectionId === 'string' ? body.collectionId.trim() : '';
	if (!collectionId) {
		throw error(400, 'Missing collectionId');
	}

	const { data: source, error: colErr } = await locals.supabase
		.from('lists')
		.select(
			'id, user_id, name, description, color, emoji, visibility, list_places(place_id, places(id, title, note, url, tags, comment, source_list, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at))'
		)
		.eq('id', collectionId)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !source) {
		throw error(404, 'Collection not found or is private');
	}

	if ((source as any).user_id === user.id) {
		throw error(409, 'You already own this collection');
	}

	const { data: newCollection, error: createErr } = await locals.supabase
		.from('lists')
		.insert({
			user_id: user.id,
			name: (source as any).name,
			description: (source as any).description ?? null,
			color: (source as any).color ?? '#A5834F',
			emoji: (source as any).emoji ?? null
		})
		.select('id, name')
		.single();

	if (createErr || !newCollection) {
		throw error(500, 'Failed to create collection');
	}

	const sourcePlaces = ((source as any).list_places as any[])
		.map((lp: any) => lp.places)
		.filter(Boolean);

	if (sourcePlaces.length > 0) {
		const placeRows = sourcePlaces.map((p: any) => {
			const row: Record<string, unknown> = { user_id: user.id };
			for (const field of PLACE_COPY_FIELDS) {
				if (p[field] !== undefined) row[field] = p[field];
			}
			row.source_list = 'shared-import';
			return row;
		});

		const { data: insertedPlaces, error: placesErr } = await locals.supabase
			.from('places')
			.insert(placeRows as any[])
			.select('id');

		if (placesErr || !insertedPlaces) {
			throw error(500, 'Failed to duplicate places');
		}

		const junctionRows = (insertedPlaces as { id: string }[]).map((p) => ({
			list_id: (newCollection as any).id,
			place_id: p.id
		}));

		const { error: junctionErr } = await locals.supabase
			.from('list_places')
			.insert(junctionRows);

		if (junctionErr) {
			throw error(500, 'Failed to link places to collection');
		}
	}

	return json({
		id: (newCollection as any).id,
		name: (newCollection as any).name,
		placeCount: sourcePlaces.length
	}, { status: 201 });
};
