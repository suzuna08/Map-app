/**
 * Google Places API (New) — Place Type Catalog
 *
 * This is a structured internal representation of the official Google place
 * types. It serves as seed data for the `google_place_type_catalog` table and
 * as the authoritative in-process reference when the database catalog has not
 * been seeded yet.
 *
 * Sources:
 *   https://developers.google.com/maps/documentation/places/web-service/place-types
 *
 * Each entry records:
 *   - `type_key`  — the snake_case identifier returned by the API
 *   - `can_be_primary` — whether it can appear as `primaryType`
 *   - `table_group` — the conceptual grouping from Google's docs (Table A / B / C)
 *   - `status` — lifecycle state for internal use
 *
 * Table groups:
 *   A = types that can be used in Place Search and are returned in place details
 *   B = additional types that can be returned but not searched
 *   C = types only used in Autocomplete (excluded here for brevity)
 */

export type GoogleTypeStatus = 'active' | 'deprecated' | 'unmapped';
export type GoogleTableGroup = 'A' | 'B' | 'C';

export interface GooglePlaceTypeEntry {
	type_key: string;
	can_be_primary: boolean;
	table_group: GoogleTableGroup;
	status: GoogleTypeStatus;
}

// ─── Table A: Primary / searchable types ─────────────────────────────────────

const TABLE_A_TYPES: string[] = [
	// Automotive
	'car_dealer', 'car_rental', 'car_repair', 'car_wash',
	'electric_vehicle_charging_station', 'gas_station', 'parking', 'rest_stop',

	// Business
	'farm',

	// Culture
	'art_gallery', 'museum', 'performing_arts_theater',

	// Education
	'library', 'preschool', 'primary_school', 'school', 'secondary_school', 'university',

	// Entertainment and Recreation
	'amusement_center', 'amusement_park', 'aquarium', 'banquet_hall', 'bowling_alley',
	'casino', 'community_center', 'convention_center', 'cultural_center',
	'dog_park', 'event_venue', 'hiking_area', 'historical_landmark',
	'marina', 'movie_rental', 'movie_theater', 'national_park',
	'night_club', 'park', 'tourist_attraction', 'visitor_center', 'wedding_venue', 'zoo',

	// Finance
	'accounting', 'atm', 'bank',

	// Food and Drink
	'american_restaurant', 'bakery', 'bar', 'barbecue_restaurant', 'brazilian_restaurant',
	'breakfast_restaurant', 'brunch_restaurant', 'cafe', 'chinese_restaurant',
	'coffee_shop', 'fast_food_restaurant', 'french_restaurant', 'greek_restaurant',
	'hamburger_restaurant', 'ice_cream_shop', 'indian_restaurant', 'indonesian_restaurant',
	'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'lebanese_restaurant',
	'meal_delivery', 'meal_takeaway', 'mediterranean_restaurant', 'mexican_restaurant',
	'middle_eastern_restaurant', 'pizza_restaurant', 'ramen_restaurant',
	'restaurant', 'sandwich_shop', 'seafood_restaurant', 'spanish_restaurant',
	'steak_house', 'sushi_restaurant', 'thai_restaurant', 'turkish_restaurant',
	'vegan_restaurant', 'vegetarian_restaurant', 'vietnamese_restaurant',

	// Government
	'city_hall', 'courthouse', 'embassy', 'fire_station',
	'local_government_office', 'police', 'post_office',

	// Health and Wellness
	'dental_clinic', 'dentist', 'doctor', 'drugstore', 'hospital',
	'medical_lab', 'pharmacy', 'physiotherapist', 'spa',

	// Lodging
	'bed_and_breakfast', 'campground', 'camping_cabin', 'cottage',
	'extended_stay_hotel', 'farmstay', 'guest_house', 'hostel', 'hotel',
	'lodging', 'motel', 'private_guest_room', 'resort_hotel', 'rv_park',

	// Places of Worship
	'church', 'hindu_temple', 'mosque', 'synagogue',

	// Services
	'barber_shop', 'beauty_salon', 'cemetery', 'child_care_agency',
	'consultant', 'courier_service', 'electrician', 'florist',
	'funeral_home', 'hair_care', 'hair_salon', 'insurance_agency',
	'laundry', 'lawyer', 'locksmith', 'moving_company',
	'painter', 'plumber', 'real_estate_agency', 'roofing_contractor',
	'storage', 'tailor', 'telecommunications_service_provider',
	'travel_agency', 'veterinary_care',

	// Shopping
	'auto_parts_store', 'bicycle_store', 'book_store', 'cell_phone_store',
	'clothing_store', 'convenience_store', 'department_store', 'discount_store',
	'electronics_store', 'furniture_store', 'gift_shop', 'grocery_store',
	'hardware_store', 'home_goods_store', 'home_improvement_store', 'jewelry_store',
	'liquor_store', 'market', 'pet_store', 'shoe_store',
	'shopping_mall', 'sporting_goods_store', 'store', 'supermarket',
	'wholesaler',

	// Sports
	'athletic_field', 'fitness_center', 'golf_course', 'gym',
	'playground', 'ski_resort', 'sports_club', 'sports_complex',
	'stadium', 'swimming_pool',

	// Transportation
	'airport', 'bus_station', 'bus_stop', 'ferry_terminal',
	'heliport', 'light_rail_station', 'park_and_ride',
	'subway_station', 'taxi_stand', 'train_station', 'transit_depot',
	'transit_station', 'truck_stop',
];

// ─── Table B: Additional returned types (not independently searchable) ───────

const TABLE_B_TYPES: string[] = [
	'administrative_area_level_1', 'administrative_area_level_2',
	'country', 'locality', 'postal_code', 'school_district',
	'city_block', 'archipelago', 'continent',
	'establishment', 'floor', 'food', 'general_contractor',
	'geocode', 'health', 'intersection', 'landmark',
	'natural_feature', 'neighborhood', 'place_of_worship',
	'plus_code', 'point_of_interest', 'political', 'post_box',
	'postal_code_prefix', 'postal_code_suffix', 'postal_town',
	'premise', 'room', 'route', 'street_address',
	'street_number', 'sublocality', 'sublocality_level_1',
	'subpremise', 'town', 'town_square',
];

function buildEntries(keys: string[], group: GoogleTableGroup, canBePrimary: boolean): GooglePlaceTypeEntry[] {
	return keys.map((type_key) => ({
		type_key,
		can_be_primary: canBePrimary,
		table_group: group,
		status: 'active' as GoogleTypeStatus,
	}));
}

export const GOOGLE_PLACE_TYPE_CATALOG: GooglePlaceTypeEntry[] = [
	...buildEntries(TABLE_A_TYPES, 'A', true),
	...buildEntries(TABLE_B_TYPES, 'B', false),
];

export const GOOGLE_TYPE_INDEX: Map<string, GooglePlaceTypeEntry> = new Map(
	GOOGLE_PLACE_TYPE_CATALOG.map((entry) => [entry.type_key, entry])
);

export function lookupGoogleType(typeKey: string): GooglePlaceTypeEntry | undefined {
	return GOOGLE_TYPE_INDEX.get(typeKey);
}

export function isKnownGoogleType(typeKey: string): boolean {
	return GOOGLE_TYPE_INDEX.has(typeKey);
}
