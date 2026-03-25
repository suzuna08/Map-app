import { GOOGLE_PLACES_API_KEY } from '$env/static/private';

const TYPE_TO_CATEGORY: Record<string, string> = {
	restaurant: 'Restaurants',
	bakery: 'Bakeries',
	cafe: 'Cafes',
	bar: 'Bars & Nightlife',
	night_club: 'Bars & Nightlife',
	meal_takeaway: 'Restaurants',
	meal_delivery: 'Restaurants',
	ramen_restaurant: 'Ramen & Noodles',
	noodle_restaurant: 'Ramen & Noodles',
	sushi_restaurant: 'Restaurants',
	japanese_restaurant: 'Restaurants',
	chinese_restaurant: 'Restaurants',
	italian_restaurant: 'Restaurants',
	french_restaurant: 'Restaurants',
	korean_restaurant: 'Restaurants',
	thai_restaurant: 'Restaurants',
	indian_restaurant: 'Restaurants',
	mexican_restaurant: 'Restaurants',
	american_restaurant: 'Restaurants',
	seafood_restaurant: 'Restaurants',
	steak_house: 'Restaurants',
	barbecue_restaurant: 'Restaurants',
	pizza_restaurant: 'Restaurants',
	ice_cream_shop: 'Sweets & Desserts',
	dessert_shop: 'Sweets & Desserts',
	confectionery: 'Sweets & Desserts',
	chocolate_shop: 'Sweets & Desserts',
	museum: 'Attractions',
	art_gallery: 'Attractions',
	tourist_attraction: 'Attractions',
	park: 'Parks & Nature',
	garden: 'Parks & Nature',
	temple: 'Attractions',
	shrine: 'Attractions',
	church: 'Attractions',
	shopping_mall: 'Shopping',
	store: 'Shopping',
	clothing_store: 'Shopping',
	book_store: 'Shopping',
	spa: 'Wellness',
	gym: 'Wellness',
	hotel: 'Hotels',
	lodging: 'Hotels'
};

const PRICE_MAP: Record<string, string> = {
	PRICE_LEVEL_FREE: 'Free',
	PRICE_LEVEL_INEXPENSIVE: '$',
	PRICE_LEVEL_MODERATE: '$$',
	PRICE_LEVEL_EXPENSIVE: '$$$',
	PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

export function extractPlaceIdFromUrl(url: string): string | null {
	const match = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/);
	if (match) return match[1];

	const placeIdMatch = url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
	if (placeIdMatch) return placeIdMatch[1];

	return null;
}

function extractSearchTextFromUrl(url: string): string | null {
	const placeMatch = url.match(/\/maps\/place\/([^/@]+)/);
	if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));

	try {
		const u = new URL(url);
		const q = u.searchParams.get('q') || u.searchParams.get('query');
		if (q && !/^[\d.,\s-]+$/.test(q)) return q;
	} catch { /* ignore */ }

	return null;
}

function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
	// Match @lat,lng or q=lat,lng patterns
	const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
	if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

	try {
		const u = new URL(url);
		const q = u.searchParams.get('q');
		if (q) {
			const coordMatch = q.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
			if (coordMatch) return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
		}
	} catch { /* ignore */ }

	return null;
}

function extractChipPlaceId(url: string): string | null {
	// Match ftid or place_id params, or ChIJ... in the URL
	try {
		const u = new URL(url);
		const ftid = u.searchParams.get('ftid');
		if (ftid) return ftid;
	} catch { /* ignore */ }

	const chijMatch = url.match(/(ChIJ[A-Za-z0-9_-]+)/);
	if (chijMatch) return chijMatch[1];

	return null;
}

function mapCategory(types: string[]): string {
	for (const type of types) {
		if (TYPE_TO_CATEGORY[type]) return TYPE_TO_CATEGORY[type];
	}
	return 'Other';
}

function isNumericOrChome(text: string): boolean {
	return /^[\d\s\-chōme]+$/i.test(text.trim());
}

function extractArea(addressComponents: any[], formattedAddress?: string): string {
	if (!addressComponents) return '';

	const priority = [
		'sublocality_level_1',
		'sublocality',
		'locality',
		'administrative_area_level_2',
		'administrative_area_level_1'
	];

	for (const type of priority) {
		const comp = addressComponents.find((c: any) => c.types?.includes(type));
		if (comp) {
			const value = comp.longText || comp.shortText || '';
			if (value && !isNumericOrChome(value)) return value;
		}
	}

	if (formattedAddress) {
		const parts = formattedAddress.split(',').map((s: string) => s.trim());
		for (const part of parts) {
			const ward = part.match(/(\w+\s*(?:City|Ward|ku))/i);
			if (ward) return ward[1];
		}
		const neighborhood = parts.find(
			(p: string) => p.length > 2 && !isNumericOrChome(p) && !/^\d/.test(p) && !p.includes('Japan') && !/^\d{3}/.test(p)
		);
		if (neighborhood) return neighborhood;
	}

	return '';
}

export function isGoogleMapsUrl(url: string): boolean {
	return /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|share\.google)/i.test(url);
}

/**
 * Strip tracking/sharing query params from shortened Google Maps URLs.
 * The short-link identifier lives in the pathname; params like ?g_st=ic
 * are added by the share sheet and can cause server-side redirects to
 * land on consent pages instead of the actual Maps page.
 */
export function cleanGoogleMapsUrl(url: string): string {
	try {
		const u = new URL(url);
		if (/maps\.app\.goo\.gl|goo\.gl\/maps|share\.google/i.test(u.host)) {
			return u.origin + u.pathname;
		}
	} catch { /* fall through */ }
	return url;
}

export function isShareGoogleUrl(url: string): boolean {
	return /^https?:\/\/(www\.)?share\.google\//i.test(url);
}

export async function resolveGoogleMapsUrl(url: string): Promise<string> {
	if (/goo\.gl|maps\.app\.goo\.gl|share\.google/.test(url)) {
		const cleaned = cleanGoogleMapsUrl(url);
		const noCache: RequestInit = { cache: 'no-store' };

		for (const candidate of [cleaned, ...(cleaned !== url ? [url] : [])]) {
			try {
				const res = await fetch(candidate, { redirect: 'follow', ...noCache });
				if (isGoogleMapsUrl(res.url) && !isShareGoogleUrl(res.url)) return res.url;

				// share.google pages may embed the destination URL in the HTML body
				if (isShareGoogleUrl(candidate)) {
					const html = await res.text();
					const metaRefresh = html.match(/content=["']\d*;\s*url=(https?:\/\/[^"']+)/i);
					if (metaRefresh && isGoogleMapsUrl(metaRefresh[1])) return metaRefresh[1];

					const mapsLink = html.match(/https:\/\/www\.google\.[a-z.]+\/maps\/place\/[^\s"'<>]+/);
					if (mapsLink) return mapsLink[0];

					const dataLink = html.match(/https:\/\/maps\.google\.[a-z.]+\/[^\s"'<>]+/);
					if (dataLink) return dataLink[0];
				}
			} catch { /* try next */ }
		}

		try {
			const res = await fetch(cleaned, { redirect: 'manual', ...noCache });
			const location = res.headers.get('location');
			if (location && isGoogleMapsUrl(location) && !isShareGoogleUrl(location)) return location;
			if (location) {
				const res2 = await fetch(location, { redirect: 'follow', ...noCache });
				if (isGoogleMapsUrl(res2.url) && !isShareGoogleUrl(res2.url)) return res2.url;
			}
		} catch { /* fall through */ }

		// share.google URLs often can't be resolved via HTTP redirects alone.
		// Return the original URL and let the caller fall back to search-based
		// place lookup using whatever context is available.
		if (isShareGoogleUrl(url)) {
			return url;
		}

		throw new Error('Could not resolve shortened Google Maps link');
	}
	return url;
}

export interface PlaceDetails {
	display_name: string;
	google_place_id: string;
	category: string;
	primary_type: string | null;
	types: string[];
	rating: number | null;
	rating_count: number | null;
	price_level: string | null;
	address: string | null;
	area: string | null;
	description: string | null;
	lat: number | null;
	lng: number | null;
	phone: string | null;
	website: string | null;
}

export async function fetchPlaceDetails(
	googleMapsUrl: string,
	placeName: string
): Promise<PlaceDetails | null> {
	const fieldMask =
		'places.id,places.displayName,places.types,places.primaryType,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.addressComponents,places.editorialSummary,places.location,places.nationalPhoneNumber,places.websiteUri';

	let searchText = extractSearchTextFromUrl(googleMapsUrl) || placeName;
	const coords = extractCoordsFromUrl(googleMapsUrl);
	const chipPlaceId = extractChipPlaceId(googleMapsUrl);

	// For share.google URLs, try scraping the page for place name / metadata
	if (!searchText && !coords && !chipPlaceId && isShareGoogleUrl(googleMapsUrl)) {
		try {
			const res = await fetch(googleMapsUrl, { redirect: 'follow', cache: 'no-store' as RequestCache });
			const html = await res.text();

			const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i);
			if (ogTitle) searchText = ogTitle[1];

			if (!searchText) {
				const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
				if (titleTag) {
					const cleaned = titleTag[1].replace(/\s*[-–|].*Google.*$/i, '').trim();
					if (cleaned && cleaned.length > 1) searchText = cleaned;
				}
			}
		} catch { /* fall through */ }
	}

	// Strategy 1: Look up by Place ID (ChIJ...) if found in URL
	if (chipPlaceId && chipPlaceId.startsWith('ChIJ')) {
		try {
			const placeRes = await fetch(
				`https://places.googleapis.com/v1/places/${chipPlaceId}`,
				{
					cache: 'no-store' as RequestCache,
					headers: {
						'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
						'X-Goog-FieldMask': fieldMask.replace(/places\./g, '')
					}
				}
			);
			if (placeRes.ok) {
				const directPlace = await placeRes.json();
				if (directPlace?.displayName) {
					return parsePlaceResult(directPlace);
				}
			}
		} catch { /* fall through to text search */ }
	}

	// Strategy 2: Text search with place name extracted from URL
	if (searchText) {
		const body: any = { textQuery: searchText, maxResultCount: 1 };
		if (coords) {
			body.locationBias = {
				circle: { center: { latitude: coords.lat, longitude: coords.lng }, radius: 500.0 }
			};
		}

		const searchResponse = await fetch(
			'https://places.googleapis.com/v1/places:searchText',
			{
				method: 'POST',
				cache: 'no-store' as RequestCache,
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
					'X-Goog-FieldMask': fieldMask
				},
				body: JSON.stringify(body)
			}
		);

		if (searchResponse.ok) {
			const data = await searchResponse.json();
			if (data.places?.[0]) return parsePlaceResult(data.places[0]);
		}
	}

	// Strategy 3: Coordinate-based nearby search as final fallback
	if (coords) {
		const nearbyResponse = await fetch(
			'https://places.googleapis.com/v1/places:searchText',
			{
				method: 'POST',
				cache: 'no-store' as RequestCache,
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
					'X-Goog-FieldMask': fieldMask
				},
				body: JSON.stringify({
					textQuery: '*',
					maxResultCount: 1,
					locationBias: {
						circle: { center: { latitude: coords.lat, longitude: coords.lng }, radius: 50.0 }
					}
				})
			}
		);

		if (nearbyResponse.ok) {
			const data = await nearbyResponse.json();
			if (data.places?.[0]) return parsePlaceResult(data.places[0]);
		}
	}

	return null;
}

function parsePlaceResult(place: any): PlaceDetails {

	const types = place.types || [];

	return {
		display_name: place.displayName?.text || '',
		google_place_id: place.id,
		category: mapCategory(types),
		primary_type: place.primaryType || types[0] || null,
		types,
		rating: place.rating || null,
		rating_count: place.userRatingCount || null,
		price_level: place.priceLevel ? PRICE_MAP[place.priceLevel] || null : null,
		address: place.formattedAddress || null,
		area: extractArea(place.addressComponents || [], place.formattedAddress),
		description: place.editorialSummary?.text || null,
		lat: place.location?.latitude || null,
		lng: place.location?.longitude || null,
		phone: place.nationalPhoneNumber || null,
		website: place.websiteUri || null
	};
}

export function buildGoogleMapsUrl(placeId: string, placeName?: string): string {
	const encodedName = placeName ? encodeURIComponent(placeName) : '';
	const pathPart = encodedName ? `/maps/place/${encodedName}` : '/maps/place/';
	return `https://www.google.com${pathPart}?ftid=${placeId}`;
}
