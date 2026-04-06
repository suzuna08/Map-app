import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPlaceDetails } from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { computeIntelTags, type IntelTagResult } from '$lib/intel-tagging';

export const POST: RequestHandler = async ({ locals }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
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
	const intelResults: Array<{ place_id: string; title: string; intel: IntelTagResult }> = [];

	const BATCH_SIZE = 3;
	for (let i = 0; i < places.length; i += BATCH_SIZE) {
		const batch = places.slice(i, i + BATCH_SIZE);
		const results = await Promise.allSettled(
			batch.map(async (place) => {
				const details = await fetchPlaceDetails(place.url!, place.title);
				if (details) {
					const { display_name: _, types: _types, ...dbFields } = details;
					await locals.supabase
						.from('places')
						.update({
							...dbFields,
							enriched_at: new Date().toISOString()
						} as any)
						.eq('id', place.id);

					const intel = computeIntelTags(details.primary_type, details.types);
					return { place_id: place.id, title: place.title, intel };
				}
				return null;
			})
		);
		for (let j = 0; j < results.length; j++) {
			const r = results[j];
			if (r.status === 'fulfilled' && r.value) {
				intelResults.push(r.value);
				enrichedCount++;
			} else if (r.status === 'rejected') {
				errors.push(`${batch[j].title}: ${r.reason instanceof Error ? r.reason.message : 'Unknown error'}`);
			}
		}
		if (i + BATCH_SIZE < places.length) {
			await new Promise((r) => setTimeout(r, 200));
		}
	}

	return json({
		enriched: enrichedCount,
		total: places.length,
		errors,
		intel_results: intelResults.map((r) => ({
			place_id: r.place_id,
			title: r.title,
			primary_category: r.intel.primary_category,
			operational_status: r.intel.operational_status,
			market_niche: r.intel.market_niche,
			suggested_tags: r.intel.suggested_tags,
		})),
		message: `Enriched ${enrichedCount}/${places.length} places`
	});
};
