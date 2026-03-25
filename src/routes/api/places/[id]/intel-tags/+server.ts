import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Place } from '$lib/types/database';
import { fetchPlaceDetails } from '$lib/google-places';
import { computeIntelTags, buildMarketDiscussionOutput } from '$lib/intel-tagging';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const placeId = params.id;
	const includeMarketOutput = url.searchParams.get('market') === 'true';

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

	let primaryType = place.primary_type;
	let types: string[] = [];

	if (place.primary_type) {
		types = [place.primary_type];
	}

	if (place.url && place.enriched_at) {
		try {
			const details = await fetchPlaceDetails(place.url, place.title);
			if (details) {
				primaryType = details.primary_type;
				types = details.types;
			}
		} catch {
			// Fall back to stored primary_type only
		}
	} else if (place.url && !place.enriched_at) {
		try {
			const details = await fetchPlaceDetails(place.url, place.title);
			if (details) {
				primaryType = details.primary_type;
				types = details.types;
			}
		} catch {
			// Fall through
		}
	}

	const intelResult = computeIntelTags(primaryType, types);

	const response: Record<string, unknown> = {
		place_id: place.id,
		place_name: place.title,
		intel: {
			primary_category: intelResult.primary_category,
			operational_status: intelResult.operational_status,
			market_niche: intelResult.market_niche,
			discussion_pillar: intelResult.discussion_pillar,
			suggested_tags: intelResult.suggested_tags,
		},
		catalog_meta: {
			hits: intelResult.catalog_hits,
			misses: intelResult.catalog_misses,
			primary_type_mapped: intelResult.primary_type_mapped,
			source_types: intelResult.source_types,
			source_primary_type: intelResult.source_primary_type,
		},
	};

	if (includeMarketOutput) {
		response.market_discussion = buildMarketDiscussionOutput(intelResult, {
			name: place.title,
			place_id: place.google_place_id,
			area: place.area,
			rating: place.rating,
			price_level: place.price_level,
		});
	}

	return json(response);
};
