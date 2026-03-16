import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isGoogleMapsUrl,
	cleanGoogleMapsUrl,
	resolveGoogleMapsUrl,
	fetchPlaceDetails,
	extractPlaceIdFromUrl
} from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { upsertSystemTags } from '$lib/tag-utils';

const NO_CACHE_HEADERS = {
	'Cache-Control': 'no-store, no-cache, must-revalidate',
	Pragma: 'no-cache'
};

/**
 * Normalize a Google Maps URL for deduplication.
 * Preserves query params that identify a place (q, query, center, ftid, etc.)
 * but strips tracking params (utm_*, g_st, etc.).
 * Only strips trailing slashes and normalizes protocol.
 */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		// Remove known tracking/sharing params that don't identify a place
		const trackingParams = ['g_st', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'entry', 'shorturl'];
		for (const p of trackingParams) {
			u.searchParams.delete(p);
		}
		const path = u.pathname.replace(/\/+$/, '');
		const qs = u.searchParams.toString();
		return u.origin + path + (qs ? '?' + qs : '');
	} catch {
		return url.replace(/\/+$/, '');
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	let rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';

	console.log('[add-by-url] raw input:', rawUrl);

	if (!rawUrl) {
		throw error(400, 'Please provide a URL');
	}

	rawUrl = cleanGoogleMapsUrl(rawUrl);
	console.log('[add-by-url] cleaned:', rawUrl);

	if (!isGoogleMapsUrl(rawUrl)) {
		throw error(400, 'Please paste a valid Google Maps URL');
	}

	let resolvedUrl: string;
	try {
		resolvedUrl = await resolveGoogleMapsUrl(rawUrl);
	} catch {
		throw error(400, 'Could not resolve this shortened link');
	}

	console.log('[add-by-url] resolved:', resolvedUrl);

	if (!isGoogleMapsUrl(resolvedUrl)) {
		throw error(400, 'The resolved link is not a valid Google Maps URL');
	}

	// --- Deduplication ---
	const placeIdFromUrl = extractPlaceIdFromUrl(resolvedUrl);
	const normalizedUrl = normalizeUrl(resolvedUrl);
	console.log('[add-by-url] placeIdFromUrl:', placeIdFromUrl, 'normalizedUrl:', normalizedUrl);

	if (placeIdFromUrl) {
		const { data: byPlaceId } = await locals.supabase
			.from('places')
			.select('*')
			.eq('user_id', user.id)
			.eq('google_place_id', placeIdFromUrl)
			.limit(1)
			.single();

		if (byPlaceId) {
			console.log('[add-by-url] DUPLICATE by placeId:', (byPlaceId as any).title);
			return json({ place: byPlaceId as Place, duplicate: true }, { headers: NO_CACHE_HEADERS });
		}
	}

	const { data: existingPlaces } = await locals.supabase
		.from('places')
		.select('*')
		.eq('user_id', user.id)
		.not('url', 'is', null);

	const urlMatch = (existingPlaces ?? []).find(
		(p: any) => p.url && normalizeUrl(p.url) === normalizedUrl
	);
	if (urlMatch) {
		console.log('[add-by-url] DUPLICATE by URL:', (urlMatch as any).title, 'stored url:', (urlMatch as any).url);
		return json({ place: urlMatch as Place, duplicate: true }, { headers: NO_CACHE_HEADERS });
	}

	// --- Fetch place details from Google ---
	const details = await fetchPlaceDetails(resolvedUrl, '');
	console.log('[add-by-url] fetched details:', details?.display_name, details?.google_place_id);

	if (!details) {
		throw error(422, 'Could not find this place on Google Maps');
	}

	// Title+address fallback dedupe (for places already enriched via CSV import)
	if (details.display_name && details.address) {
		const { data: byNameAddr } = await locals.supabase
			.from('places')
			.select('*')
			.eq('user_id', user.id)
			.eq('title', details.display_name)
			.eq('address', details.address)
			.limit(1)
			.single();

		if (byNameAddr) {
			console.log('[add-by-url] DUPLICATE by name+addr:', (byNameAddr as any).title);
			return json({ place: byNameAddr as Place, duplicate: true }, { headers: NO_CACHE_HEADERS });
		}
	}

	// --- Insert ---
	const { display_name, ...dbFields } = details;

	const { data: inserted, error: insertError } = await locals.supabase
		.from('places')
		.insert({
			user_id: user.id,
			title: display_name || 'Unnamed Place',
			url: resolvedUrl,
			source_list: 'url-import',
			...dbFields,
			enriched_at: new Date().toISOString()
		} as any)
		.select()
		.single();

	if (insertError) {
		throw error(500, insertError.message);
	}

	const place = inserted as Place;
	console.log('[add-by-url] INSERTED:', place.title);

	await upsertSystemTags(locals.supabase, user.id, place.id, details.category, details.area);

	return json({ place, duplicate: false }, { status: 201, headers: NO_CACHE_HEADERS });
};
