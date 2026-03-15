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
	const match = url.match(/\/maps\/place\/([^/]+)/);
	if (match) return decodeURIComponent(match[1].replace(/\+/g, ' '));
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

export interface PlaceDetails {
	google_place_id: string;
	category: string;
	primary_type: string | null;
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
	const searchText = extractSearchTextFromUrl(googleMapsUrl) || placeName;

	const searchResponse = await fetch(
		'https://places.googleapis.com/v1/places:searchText',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
				'X-Goog-FieldMask':
					'places.id,places.displayName,places.types,places.primaryType,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.addressComponents,places.editorialSummary,places.location,places.nationalPhoneNumber,places.websiteUri'
			},
			body: JSON.stringify({
				textQuery: searchText,
				maxResultCount: 1
			})
		}
	);

	if (!searchResponse.ok) {
		console.error('Google Places API error:', await searchResponse.text());
		return null;
	}

	const data = await searchResponse.json();
	const place = data.places?.[0];

	if (!place) return null;

	const types = place.types || [];

	return {
		google_place_id: place.id,
		category: mapCategory(types),
		primary_type: place.primaryType || types[0] || null,
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
