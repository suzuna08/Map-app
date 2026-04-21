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
import { computeIntelTags, buildMarketDiscussionOutput } from '$lib/intel-tagging';
import { createTimingContext, logTimingSummary, setUrlTimingEnabled, isUrlTimingEnabled } from '$lib/url-timing';
import { env } from '$env/dynamic/private';

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

	const rows = validIds.map((tagId: string) => ({ place_id: placeId, tag_id: tagId }));
	const { error } = await supabase
		.from('place_tags')
		.upsert(rows, { onConflict: 'place_id,tag_id', ignoreDuplicates: true });

	if (error) {
		console.error('[applyContextTags] upsert error:', error);
		return 0;
	}

	return validIds.length;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	setUrlTimingEnabled(!!env.DEBUG_URL_TIMING);
	const timing = createTimingContext();
	const debug = isUrlTimingEnabled();
	timing.mark('req:received');

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

	timing.mark('parse:clean');
	rawUrl = cleanGoogleMapsUrl(rawUrl);
	console.log('[add-by-url] cleaned:', rawUrl);

	if (!isGoogleMapsUrl(rawUrl)) {
		throw error(400, 'Please paste a valid Google Maps URL');
	}

	timing.mark('resolve:start');
	let resolvedUrl: string;
	try {
		resolvedUrl = await resolveGoogleMapsUrl(rawUrl, debug ? timing : undefined);
	} catch {
		throw error(400, 'Could not resolve this shortened link');
	}
	timing.mark('resolve:done');

	console.log('[add-by-url] resolved:', resolvedUrl);

	const isUnresolvableShareUrl = isShareGoogleUrl(resolvedUrl);

	if (!isGoogleMapsUrl(resolvedUrl)) {
		throw error(400, 'The resolved link is not a valid Google Maps URL');
	}

	timing.mark('dedup1+api:start');
	const placeIdFromUrl = isUnresolvableShareUrl ? null : extractPlaceIdFromUrl(resolvedUrl);
	const normalizedUrl = isUnresolvableShareUrl ? null : normalizeUrl(resolvedUrl);
	console.log('[add-by-url] placeIdFromUrl:', placeIdFromUrl, 'normalizedUrl:', normalizedUrl, 'isShareUrl:', isUnresolvableShareUrl);

	async function handleDuplicate(dupPlace: Place) {
		if (autoApplyContextTags && contextTagIds.length > 0) {
			const applied = await applyContextTags(locals.supabase, user!.id, dupPlace.id, contextTagIds);
			console.log('[add-by-url] DUPLICATE, context tags applied:', applied);
			timing.mark('req:done-dup');
			if (debug) logTimingSummary('add-by-url', timing);
			return json(
				{ place: dupPlace, duplicate: true, contextTagsApplied: applied, contextTagsRequested: contextTagIds.length, ...(debug ? { __timing: timing.summary() } : {}) },
				{ headers: NO_CACHE_HEADERS }
			);
		}
		timing.mark('req:done-dup');
		if (debug) logTimingSummary('add-by-url', timing);
		return json({ place: dupPlace, duplicate: true, contextTagsApplied: 0, contextTagsRequested: 0, ...(debug ? { __timing: timing.summary() } : {}) }, { headers: NO_CACHE_HEADERS });
	}

	// Run dedup round 1 (parallel queries) AND Google API call simultaneously
	const dedup1Promise = (async () => {
		timing.mark('dedup1:start');
		const results = await Promise.all([
			placeIdFromUrl
				? locals.supabase
					.from('places').select('*')
					.eq('user_id', user.id).eq('google_place_id', placeIdFromUrl)
					.limit(1).single().then(r => r.data as Place | null)
				: Promise.resolve(null),
			normalizedUrl
				? locals.supabase
					.from('places').select('*')
					.eq('user_id', user.id).eq('url', normalizedUrl)
					.limit(1).maybeSingle().then(r => r.data as Place | null)
				: Promise.resolve(null),
		]);
		timing.mark('dedup1:done');
		return results[0] ?? results[1] ?? null;
	})();

	const googleApiPromise = (async () => {
		timing.mark('google-api:start');
		const result = await fetchPlaceDetails(
			resolvedUrl, '',
			debug ? timing : undefined,
			{ hexPlaceId: placeIdFromUrl },
		);
		timing.mark('google-api:done');
		return result;
	})();

	const [dedup1Match, details] = await Promise.all([dedup1Promise, googleApiPromise]);
	timing.mark('dedup1+api:done');

	if (dedup1Match) {
		console.log('[add-by-url] DUPLICATE by dedup1:', (dedup1Match as any).title);
		return handleDuplicate(dedup1Match);
	}

	console.log('[add-by-url] fetched details:', details?.display_name, details?.google_place_id);

	if (!details) {
		throw error(422, 'Could not find this place on Google Maps');
	}

	// Dedup round 2: parallel queries for post-fetch checks
	timing.mark('dedup2:start');
	const dedup2Results = await Promise.all([
		(isUnresolvableShareUrl && details.google_place_id)
			? locals.supabase
				.from('places').select('*')
				.eq('user_id', user.id).eq('google_place_id', details.google_place_id)
				.limit(1).single().then(r => r.data as Place | null)
			: Promise.resolve(null),
		(details.display_name && details.address)
			? locals.supabase
				.from('places').select('*')
				.eq('user_id', user.id).eq('title', details.display_name).eq('address', details.address)
				.limit(1).single().then(r => r.data as Place | null)
			: Promise.resolve(null),
	]);
	timing.mark('dedup2:done');

	const dedup2Match = dedup2Results[0] ?? dedup2Results[1] ?? null;
	if (dedup2Match) {
		console.log('[add-by-url] DUPLICATE by dedup2:', (dedup2Match as any).title);
		return handleDuplicate(dedup2Match);
	}

	timing.mark('insert:start');
	const { display_name, types: _types, ...dbFields } = details;

	const storedUrl = (isUnresolvableShareUrl && details.google_place_id)
		? buildGoogleMapsUrl(details.google_place_id, display_name)
		: normalizeUrl(resolvedUrl);

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
	timing.mark('insert:done');

	if (insertError) {
		throw error(500, insertError.message);
	}

	const place = inserted as Place;
	console.log('[add-by-url] INSERTED:', place.title);

	let contextTagsApplied = 0;
	if (autoApplyContextTags && contextTagIds.length > 0) {
		timing.mark('tags:start');
		contextTagsApplied = await applyContextTags(locals.supabase, user.id, place.id, contextTagIds);
		timing.mark('tags:done');
		console.log('[add-by-url] NEW, context tags applied:', contextTagsApplied);
	}

	const intelResult = computeIntelTags(details.primary_type, details.types);

	timing.mark('req:done');
	if (debug) logTimingSummary('add-by-url', timing);

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
			},
			...(debug ? { __timing: timing.summary() } : {}),
		},
		{ status: 201, headers: NO_CACHE_HEADERS }
	);
};
