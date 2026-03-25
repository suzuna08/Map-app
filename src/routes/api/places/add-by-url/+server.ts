import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isGoogleMapsUrl,
	isShareGoogleUrl,
	cleanGoogleMapsUrl,
	resolveGoogleMapsUrl,
	fetchPlaceDetails,
	extractPlaceIdFromUrl,
	buildGoogleMapsUrl
} from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { upsertSystemTags } from '$lib/tag-utils';
import { computeIntelTags, buildMarketDiscussionOutput } from '$lib/intel-tagging';

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

async function applyContextTags(
	supabase: import('@supabase/supabase-js').SupabaseClient,
	userId: string,
	placeId: string,
	contextTagIds: string[]
): Promise<number> {
	if (contextTagIds.length === 0) return 0;

	const { data: validTags } = await supabase
		.from('tags')
		.select('id')
		.eq('user_id', userId)
		.eq('source', 'user')
		.in('id', contextTagIds);

	const validIds = (validTags ?? []).map((t: { id: string }) => t.id);
	if (validIds.length === 0) return 0;

	const { data: existing } = await supabase
		.from('place_tags')
		.select('tag_id')
		.eq('place_id', placeId)
		.in('tag_id', validIds);

	const existingIds = new Set((existing ?? []).map((pt: { tag_id: string }) => pt.tag_id));
	const missing = validIds.filter((id: string) => !existingIds.has(id));

	if (missing.length > 0) {
		await supabase
			.from('place_tags')
			.insert(missing.map((tagId: string) => ({ place_id: placeId, tag_id: tagId })));
	}

	return missing.length;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	let rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
	const contextTagIds: string[] = Array.isArray(body?.contextTagIds) ? body.contextTagIds : [];
	const autoApplyContextTags: boolean = body?.autoApplyContextTags === true;

	console.log('[add-by-url] raw input:', rawUrl, 'contextTags:', contextTagIds.length, 'autoApply:', autoApplyContextTags);

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

	// share.google URLs may not resolve to a standard Maps URL.
	// In that case, resolvedUrl will still be the share.google link.
	// We skip URL-based extraction and rely on the Places API search.
	const isUnresolvableShareUrl = isShareGoogleUrl(resolvedUrl);

	if (!isGoogleMapsUrl(resolvedUrl)) {
		throw error(400, 'The resolved link is not a valid Google Maps URL');
	}

	// --- Deduplication ---
	const placeIdFromUrl = isUnresolvableShareUrl ? null : extractPlaceIdFromUrl(resolvedUrl);
	const normalizedUrl = isUnresolvableShareUrl ? null : normalizeUrl(resolvedUrl);
	console.log('[add-by-url] placeIdFromUrl:', placeIdFromUrl, 'normalizedUrl:', normalizedUrl, 'isShareUrl:', isUnresolvableShareUrl);

	// Helper: handle duplicate place with optional context tag application
	async function handleDuplicate(dupPlace: Place) {
		if (autoApplyContextTags && contextTagIds.length > 0) {
			const applied = await applyContextTags(locals.supabase, user!.id, dupPlace.id, contextTagIds);
			console.log('[add-by-url] DUPLICATE, context tags applied:', applied);
			return json(
				{ place: dupPlace, duplicate: true, contextTagsApplied: applied, contextTagsRequested: contextTagIds.length },
				{ headers: NO_CACHE_HEADERS }
			);
		}
		return json({ place: dupPlace, duplicate: true, contextTagsApplied: 0, contextTagsRequested: 0 }, { headers: NO_CACHE_HEADERS });
	}

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
			return handleDuplicate(byPlaceId as Place);
		}
	}

	const { data: existingPlaces } = await locals.supabase
		.from('places')
		.select('*')
		.eq('user_id', user.id)
		.not('url', 'is', null);

	if (normalizedUrl) {
		const urlMatch = (existingPlaces ?? []).find(
			(p: any) => p.url && normalizeUrl(p.url) === normalizedUrl
		);
		if (urlMatch) {
			console.log('[add-by-url] DUPLICATE by URL:', (urlMatch as any).title, 'stored url:', (urlMatch as any).url);
			return handleDuplicate(urlMatch as Place);
		}
	}

	// --- Fetch place details from Google ---
	const details = await fetchPlaceDetails(resolvedUrl, '');
	console.log('[add-by-url] fetched details:', details?.display_name, details?.google_place_id);

	if (!details) {
		throw error(422, 'Could not find this place on Google Maps');
	}

	// For share.google URLs, we only get the google_place_id after the API call,
	// so check for duplicates by google_place_id now.
	if (isUnresolvableShareUrl && details.google_place_id) {
		const { data: byPlaceId } = await locals.supabase
			.from('places')
			.select('*')
			.eq('user_id', user.id)
			.eq('google_place_id', details.google_place_id)
			.limit(1)
			.single();

		if (byPlaceId) {
			console.log('[add-by-url] DUPLICATE by placeId (post-fetch):', (byPlaceId as any).title);
			return handleDuplicate(byPlaceId as Place);
		}
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
			return handleDuplicate(byNameAddr as Place);
		}
	}

	// --- Insert ---
	const { display_name, types: _types, ...dbFields } = details;

	// Build a canonical Google Maps URL from the place ID when the input
	// was a share.google link or other URL that doesn't work as a permalink.
	const storedUrl = (isUnresolvableShareUrl && details.google_place_id)
		? buildGoogleMapsUrl(details.google_place_id, display_name)
		: resolvedUrl;

	const { data: inserted, error: insertError } = await locals.supabase
		.from('places')
		.insert({
			user_id: user.id,
			title: display_name || 'Unnamed Place',
			url: storedUrl,
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

	let contextTagsApplied = 0;
	if (autoApplyContextTags && contextTagIds.length > 0) {
		contextTagsApplied = await applyContextTags(locals.supabase, user.id, place.id, contextTagIds);
		console.log('[add-by-url] NEW, context tags applied:', contextTagsApplied);
	}

	const intelResult = computeIntelTags(details.primary_type, details.types);

	return json(
		{
			place,
			duplicate: false,
			contextTagsApplied,
			contextTagsRequested: contextTagIds.length,
			intel: {
				primary_category: intelResult.primary_category,
				operational_status: intelResult.operational_status,
				market_niche: intelResult.market_niche,
				discussion_pillar: intelResult.discussion_pillar,
				suggested_tags: intelResult.suggested_tags,
			}
		},
		{ status: 201, headers: NO_CACHE_HEADERS }
	);
};
