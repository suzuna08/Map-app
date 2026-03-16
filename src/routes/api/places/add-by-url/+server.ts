import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isGoogleMapsUrl,
	resolveGoogleMapsUrl,
	fetchPlaceDetails,
	extractPlaceIdFromUrl
} from '$lib/google-places';
import type { Place } from '$lib/types/database';
import { upsertSystemTags } from '$lib/tag-utils';

function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		return u.origin + u.pathname.replace(/\/+$/, '');
	} catch {
		return url.replace(/\/+$/, '');
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session, user } = await locals.safeGetSession();
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';

	if (!rawUrl) {
		throw error(400, 'Please provide a URL');
	}

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

	// --- Deduplication ---
	const placeIdFromUrl = extractPlaceIdFromUrl(resolvedUrl);
	const normalizedUrl = normalizeUrl(resolvedUrl);

	if (placeIdFromUrl) {
		const { data: byPlaceId } = await locals.supabase
			.from('places')
			.select('*')
			.eq('user_id', user.id)
			.eq('google_place_id', placeIdFromUrl)
			.limit(1)
			.single();

		if (byPlaceId) {
			return json({ place: byPlaceId as Place, duplicate: true });
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
		return json({ place: urlMatch as Place, duplicate: true });
	}

	// --- Fetch place details from Google ---
	const details = await fetchPlaceDetails(resolvedUrl, '');

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
			return json({ place: byNameAddr as Place, duplicate: true });
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

	await upsertSystemTags(locals.supabase, user.id, place.id, details.category, details.area);

	return json({ place, duplicate: false }, { status: 201 });
};
