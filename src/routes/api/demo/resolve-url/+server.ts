import { json, error, type RequestHandler } from '@sveltejs/kit';
import {
	isGoogleMapsUrl,
	cleanGoogleMapsUrl,
	resolveGoogleMapsUrl,
	fetchPlaceDetails
} from '$lib/google-places';
import { computeIntelTags } from '$lib/intel-tagging';

const ipCounts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = ipCounts.get(ip);
	if (!entry || now > entry.resetAt) {
		ipCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (entry.count >= LIMIT) return false;
	entry.count++;
	return true;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	if (!checkRateLimit(ip)) {
		throw error(429, 'Demo limit reached (10 places/hour). Sign up for unlimited access!');
	}

	const body = await request.json().catch(() => null);
	let rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';

	if (!rawUrl) {
		throw error(400, 'Please provide a URL');
	}

	rawUrl = cleanGoogleMapsUrl(rawUrl);

	if (!isGoogleMapsUrl(rawUrl)) {
		throw error(400, 'Please paste a valid Google Maps URL');
	}

	let resolvedUrl: string;
	try {
		resolvedUrl = await resolveGoogleMapsUrl(rawUrl);
	} catch {
		throw error(400, 'Could not resolve this shortened link');
	}

	if (!isGoogleMapsUrl(resolvedUrl)) {
		throw error(400, 'The resolved link is not a valid Google Maps URL');
	}

	const details = await fetchPlaceDetails(resolvedUrl, '');

	if (!details) {
		throw error(422, 'Could not find this place on Google Maps');
	}

	const intel = computeIntelTags(details.primary_type, details.types);

	return json({
		place: {
			id: crypto.randomUUID(),
			title: details.display_name || 'Unnamed Place',
			url: resolvedUrl,
			google_place_id: details.google_place_id,
			category: details.category,
			primary_type: details.primary_type,
			rating: details.rating,
			rating_count: details.rating_count,
			price_level: details.price_level,
			address: details.address,
			area: details.area,
			description: details.description,
			lat: details.lat,
			lng: details.lng,
			phone: details.phone,
			website: details.website,
		},
		suggestedTags: intel.suggested_tags,
		category: intel.primary_category,
	});
};
