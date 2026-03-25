import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPlaceDetails } from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { upsertSystemTags } from '$lib/tag-utils';
import { computeIntelTags } from '$lib/intel-tagging';

export const POST: RequestHandler = async ({ params, locals }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const placeId = params.id;

	const { data: placeData } = await locals.supabase
		.from('places')
		.select('*')
		.eq('id', placeId as string)
		.eq('user_id', user.id)
		.single();

	const place = placeData as Place | null;

	if (!place) {
		throw error(404, 'Place not found');
	}

	if (place.enriched_at) {
		return json({ place, cached: true });
	}

	if (!place.url) {
		throw error(400, 'Place has no Google Maps URL');
	}

	const details = await fetchPlaceDetails(place.url, place.title);

	if (!details) {
		throw error(502, 'Could not fetch place details from Google');
	}

	const { display_name: _, types: _types, ...dbFields } = details;
	const { error: updateError } = await locals.supabase
		.from('places')
		.update({
			...dbFields,
			enriched_at: new Date().toISOString()
		} as any)
		.eq('id', placeId as string);

	if (updateError) {
		throw error(500, updateError.message);
	}

	await upsertSystemTags(locals.supabase, user.id, placeId as string, details.category, details.area);

	const intelResult = computeIntelTags(details.primary_type, details.types);

	const enrichedPlace = { ...place, ...details, enriched_at: new Date().toISOString() };
	return json({
		place: enrichedPlace,
		cached: false,
		intel: {
			primary_category: intelResult.primary_category,
			operational_status: intelResult.operational_status,
			market_niche: intelResult.market_niche,
			discussion_pillar: intelResult.discussion_pillar,
			suggested_tags: intelResult.suggested_tags,
		}
	});
};
