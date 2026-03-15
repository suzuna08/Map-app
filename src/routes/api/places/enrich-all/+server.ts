import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPlaceDetails } from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { upsertSystemTags } from '$lib/tag-utils';

export const POST: RequestHandler = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const { data: placesData } = await locals.supabase
		.from('places')
		.select('*')
		.eq('user_id', user.id)
		.is('enriched_at', null)
		.not('url', 'is', null)
		.limit(10);

	const places = (placesData ?? []) as Place[];

	if (places.length === 0) {
		return json({ enriched: 0, total: 0, message: 'No places to enrich' });
	}

	let enrichedCount = 0;
	const errors: string[] = [];

	for (const place of places) {
		try {
			const details = await fetchPlaceDetails(place.url!, place.title);
			if (details) {
				await locals.supabase
					.from('places')
					.update({
						...details,
						enriched_at: new Date().toISOString()
					} as any)
					.eq('id', place.id);

				await upsertSystemTags(locals.supabase, user.id, place.id, details.category, details.area);
				enrichedCount++;
			}
		} catch (e) {
			errors.push(`${place.title}: ${e instanceof Error ? e.message : 'Unknown error'}`);
		}

		await new Promise((r) => setTimeout(r, 200));
	}

	return json({
		enriched: enrichedCount,
		total: places.length,
		errors,
		message: `Enriched ${enrichedCount}/${places.length} places`
	});
};
