/**
 * Internal Mapping Table — Google Place Types → Product Intelligence
 *
 * This is the editable, versionable mapping layer that translates raw Google
 * place type keys into the app's own classification dimensions:
 *
 *   - primary_category:   The app-level category bucket (e.g. "Dining", "Fitness")
 *   - operational_status: Business model signal (e.g. "dine-in", "retail", "service")
 *   - market_niche:       Finer positioning for market discussion (e.g. "ramen", "boutique-gym")
 *   - discussion_pillar:  Optional market-discussion prompt anchor (e.g. "taipei-food-scene")
 *   - suggested_tags:     Product tags the system may propose to the user
 *
 * Design rules:
 *   - One entry per Google type key that we actively map
 *   - Unmapped types fall through to a default classification
 *   - This structure is the authoritative source; avoid scattering business
 *     rules across runtime conditionals
 */

export interface IntelTagMapping {
	google_type_key: string;
	primary_category: string;
	operational_status: string;
	market_niche: string;
	discussion_pillar: string | null;
	suggested_tags: string[];
}

const MAPPINGS: IntelTagMapping[] = [
	// ── Food & Drink ──────────────────────────────────────────────────────
	{ google_type_key: 'restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'general-restaurant', discussion_pillar: 'food-scene', suggested_tags: ['restaurant'] },
	{ google_type_key: 'american_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'american', discussion_pillar: 'food-scene', suggested_tags: ['american', 'restaurant'] },
	{ google_type_key: 'barbecue_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'barbecue', discussion_pillar: 'food-scene', suggested_tags: ['bbq', 'restaurant'] },
	{ google_type_key: 'brazilian_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'brazilian', discussion_pillar: 'food-scene', suggested_tags: ['brazilian', 'restaurant'] },
	{ google_type_key: 'breakfast_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'breakfast', discussion_pillar: 'food-scene', suggested_tags: ['breakfast', 'brunch'] },
	{ google_type_key: 'brunch_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'brunch', discussion_pillar: 'food-scene', suggested_tags: ['brunch', 'breakfast'] },
	{ google_type_key: 'chinese_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'chinese', discussion_pillar: 'food-scene', suggested_tags: ['chinese', 'restaurant'] },
	{ google_type_key: 'french_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'french', discussion_pillar: 'food-scene', suggested_tags: ['french', 'fine-dining'] },
	{ google_type_key: 'greek_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'greek', discussion_pillar: 'food-scene', suggested_tags: ['greek', 'mediterranean'] },
	{ google_type_key: 'hamburger_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'burger', discussion_pillar: 'food-scene', suggested_tags: ['burger', 'fast-casual'] },
	{ google_type_key: 'indian_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'indian', discussion_pillar: 'food-scene', suggested_tags: ['indian', 'restaurant'] },
	{ google_type_key: 'indonesian_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'indonesian', discussion_pillar: 'food-scene', suggested_tags: ['indonesian', 'restaurant'] },
	{ google_type_key: 'italian_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'italian', discussion_pillar: 'food-scene', suggested_tags: ['italian', 'restaurant'] },
	{ google_type_key: 'japanese_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'japanese', discussion_pillar: 'food-scene', suggested_tags: ['japanese', 'restaurant'] },
	{ google_type_key: 'korean_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'korean', discussion_pillar: 'food-scene', suggested_tags: ['korean', 'restaurant'] },
	{ google_type_key: 'lebanese_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'lebanese', discussion_pillar: 'food-scene', suggested_tags: ['lebanese', 'middle-eastern'] },
	{ google_type_key: 'mediterranean_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'mediterranean', discussion_pillar: 'food-scene', suggested_tags: ['mediterranean', 'restaurant'] },
	{ google_type_key: 'mexican_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'mexican', discussion_pillar: 'food-scene', suggested_tags: ['mexican', 'restaurant'] },
	{ google_type_key: 'middle_eastern_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'middle-eastern', discussion_pillar: 'food-scene', suggested_tags: ['middle-eastern', 'restaurant'] },
	{ google_type_key: 'pizza_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'pizza', discussion_pillar: 'food-scene', suggested_tags: ['pizza', 'italian'] },
	{ google_type_key: 'ramen_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'ramen', discussion_pillar: 'food-scene', suggested_tags: ['ramen', 'noodles', 'japanese'] },
	{ google_type_key: 'seafood_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'seafood', discussion_pillar: 'food-scene', suggested_tags: ['seafood', 'restaurant'] },
	{ google_type_key: 'spanish_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'spanish', discussion_pillar: 'food-scene', suggested_tags: ['spanish', 'tapas'] },
	{ google_type_key: 'steak_house', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'steakhouse', discussion_pillar: 'food-scene', suggested_tags: ['steak', 'fine-dining'] },
	{ google_type_key: 'sushi_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'sushi', discussion_pillar: 'food-scene', suggested_tags: ['sushi', 'japanese'] },
	{ google_type_key: 'thai_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'thai', discussion_pillar: 'food-scene', suggested_tags: ['thai', 'restaurant'] },
	{ google_type_key: 'turkish_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'turkish', discussion_pillar: 'food-scene', suggested_tags: ['turkish', 'restaurant'] },
	{ google_type_key: 'vegan_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'vegan', discussion_pillar: 'food-scene', suggested_tags: ['vegan', 'plant-based'] },
	{ google_type_key: 'vegetarian_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'vegetarian', discussion_pillar: 'food-scene', suggested_tags: ['vegetarian', 'healthy'] },
	{ google_type_key: 'vietnamese_restaurant', primary_category: 'Dining', operational_status: 'dine-in', market_niche: 'vietnamese', discussion_pillar: 'food-scene', suggested_tags: ['vietnamese', 'restaurant'] },
	{ google_type_key: 'sandwich_shop', primary_category: 'Dining', operational_status: 'quick-service', market_niche: 'sandwich', discussion_pillar: 'food-scene', suggested_tags: ['sandwich', 'lunch'] },
	{ google_type_key: 'fast_food_restaurant', primary_category: 'Dining', operational_status: 'quick-service', market_niche: 'fast-food', discussion_pillar: 'food-scene', suggested_tags: ['fast-food', 'quick-bite'] },
	{ google_type_key: 'meal_delivery', primary_category: 'Dining', operational_status: 'delivery', market_niche: 'delivery', discussion_pillar: 'food-scene', suggested_tags: ['delivery'] },
	{ google_type_key: 'meal_takeaway', primary_category: 'Dining', operational_status: 'takeaway', market_niche: 'takeaway', discussion_pillar: 'food-scene', suggested_tags: ['takeaway'] },

	// ── Cafes & Bakeries ──────────────────────────────────────────────────
	{ google_type_key: 'cafe', primary_category: 'Cafe', operational_status: 'dine-in', market_niche: 'cafe', discussion_pillar: 'cafe-culture', suggested_tags: ['cafe', 'coffee'] },
	{ google_type_key: 'coffee_shop', primary_category: 'Cafe', operational_status: 'quick-service', market_niche: 'coffee', discussion_pillar: 'cafe-culture', suggested_tags: ['coffee', 'cafe'] },
	{ google_type_key: 'bakery', primary_category: 'Cafe', operational_status: 'retail', market_niche: 'bakery', discussion_pillar: 'cafe-culture', suggested_tags: ['bakery', 'pastry'] },

	// ── Sweets & Desserts ─────────────────────────────────────────────────
	{ google_type_key: 'ice_cream_shop', primary_category: 'Sweets & Desserts', operational_status: 'retail', market_niche: 'ice-cream', discussion_pillar: 'food-scene', suggested_tags: ['ice-cream', 'dessert'] },

	// ── Bars & Nightlife ──────────────────────────────────────────────────
	{ google_type_key: 'bar', primary_category: 'Nightlife', operational_status: 'dine-in', market_niche: 'bar', discussion_pillar: 'nightlife', suggested_tags: ['bar', 'drinks'] },
	{ google_type_key: 'night_club', primary_category: 'Nightlife', operational_status: 'entertainment', market_niche: 'club', discussion_pillar: 'nightlife', suggested_tags: ['club', 'nightlife'] },

	// ── Fitness & Wellness ────────────────────────────────────────────────
	{ google_type_key: 'gym', primary_category: 'Fitness', operational_status: 'membership', market_niche: 'gym', discussion_pillar: 'fitness-wellness', suggested_tags: ['gym', 'workout'] },
	{ google_type_key: 'fitness_center', primary_category: 'Fitness', operational_status: 'membership', market_niche: 'fitness-center', discussion_pillar: 'fitness-wellness', suggested_tags: ['fitness', 'gym'] },
	{ google_type_key: 'sports_club', primary_category: 'Fitness', operational_status: 'membership', market_niche: 'sports-club', discussion_pillar: 'fitness-wellness', suggested_tags: ['sports', 'club'] },
	{ google_type_key: 'swimming_pool', primary_category: 'Fitness', operational_status: 'facility', market_niche: 'swimming', discussion_pillar: 'fitness-wellness', suggested_tags: ['swimming', 'pool'] },
	{ google_type_key: 'spa', primary_category: 'Wellness', operational_status: 'service', market_niche: 'spa', discussion_pillar: 'fitness-wellness', suggested_tags: ['spa', 'relaxation'] },
	{ google_type_key: 'yoga_studio', primary_category: 'Wellness', operational_status: 'membership', market_niche: 'yoga', discussion_pillar: 'fitness-wellness', suggested_tags: ['yoga', 'wellness'] },

	// ── Attractions & Culture ─────────────────────────────────────────────
	{ google_type_key: 'museum', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'museum', discussion_pillar: 'culture-arts', suggested_tags: ['museum', 'culture'] },
	{ google_type_key: 'art_gallery', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'art-gallery', discussion_pillar: 'culture-arts', suggested_tags: ['art', 'gallery'] },
	{ google_type_key: 'tourist_attraction', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'landmark', discussion_pillar: 'tourism', suggested_tags: ['attraction', 'sightseeing'] },
	{ google_type_key: 'historical_landmark', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'historical', discussion_pillar: 'culture-arts', suggested_tags: ['historical', 'landmark'] },
	{ google_type_key: 'performing_arts_theater', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'theater', discussion_pillar: 'culture-arts', suggested_tags: ['theater', 'performing-arts'] },
	{ google_type_key: 'amusement_park', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'theme-park', discussion_pillar: 'tourism', suggested_tags: ['theme-park', 'entertainment'] },
	{ google_type_key: 'zoo', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'zoo', discussion_pillar: 'tourism', suggested_tags: ['zoo', 'family'] },
	{ google_type_key: 'aquarium', primary_category: 'Attractions', operational_status: 'venue', market_niche: 'aquarium', discussion_pillar: 'tourism', suggested_tags: ['aquarium', 'family'] },

	// ── Parks & Nature ────────────────────────────────────────────────────
	{ google_type_key: 'park', primary_category: 'Parks & Nature', operational_status: 'open-space', market_niche: 'park', discussion_pillar: 'outdoors', suggested_tags: ['park', 'outdoors'] },
	{ google_type_key: 'national_park', primary_category: 'Parks & Nature', operational_status: 'open-space', market_niche: 'national-park', discussion_pillar: 'outdoors', suggested_tags: ['national-park', 'hiking'] },
	{ google_type_key: 'hiking_area', primary_category: 'Parks & Nature', operational_status: 'open-space', market_niche: 'hiking', discussion_pillar: 'outdoors', suggested_tags: ['hiking', 'nature'] },
	{ google_type_key: 'dog_park', primary_category: 'Parks & Nature', operational_status: 'open-space', market_niche: 'dog-park', discussion_pillar: 'outdoors', suggested_tags: ['dog-friendly', 'park'] },

	// ── Places of Worship ─────────────────────────────────────────────────
	{ google_type_key: 'church', primary_category: 'Worship & Temples', operational_status: 'venue', market_niche: 'church', discussion_pillar: 'culture-arts', suggested_tags: ['church'] },
	{ google_type_key: 'hindu_temple', primary_category: 'Worship & Temples', operational_status: 'venue', market_niche: 'temple', discussion_pillar: 'culture-arts', suggested_tags: ['temple', 'hindu'] },
	{ google_type_key: 'mosque', primary_category: 'Worship & Temples', operational_status: 'venue', market_niche: 'mosque', discussion_pillar: 'culture-arts', suggested_tags: ['mosque'] },
	{ google_type_key: 'synagogue', primary_category: 'Worship & Temples', operational_status: 'venue', market_niche: 'synagogue', discussion_pillar: 'culture-arts', suggested_tags: ['synagogue'] },

	// ── Shopping ───────────────────────────────────────────────────────────
	{ google_type_key: 'shopping_mall', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'mall', discussion_pillar: 'shopping', suggested_tags: ['mall', 'shopping'] },
	{ google_type_key: 'store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'general-store', discussion_pillar: 'shopping', suggested_tags: ['store'] },
	{ google_type_key: 'clothing_store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'fashion', discussion_pillar: 'shopping', suggested_tags: ['clothing', 'fashion'] },
	{ google_type_key: 'book_store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'bookstore', discussion_pillar: 'shopping', suggested_tags: ['books', 'bookstore'] },
	{ google_type_key: 'grocery_store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'grocery', discussion_pillar: 'shopping', suggested_tags: ['grocery'] },
	{ google_type_key: 'supermarket', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'supermarket', discussion_pillar: 'shopping', suggested_tags: ['supermarket', 'grocery'] },
	{ google_type_key: 'convenience_store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'convenience', discussion_pillar: 'shopping', suggested_tags: ['convenience'] },
	{ google_type_key: 'market', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'market', discussion_pillar: 'shopping', suggested_tags: ['market', 'local'] },
	{ google_type_key: 'electronics_store', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'electronics', discussion_pillar: 'shopping', suggested_tags: ['electronics', 'tech'] },
	{ google_type_key: 'gift_shop', primary_category: 'Shopping', operational_status: 'retail', market_niche: 'gift-shop', discussion_pillar: 'shopping', suggested_tags: ['gifts', 'souvenirs'] },

	// ── Lodging ────────────────────────────────────────────────────────────
	{ google_type_key: 'hotel', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'hotel', discussion_pillar: 'travel-stays', suggested_tags: ['hotel', 'stay'] },
	{ google_type_key: 'hostel', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'hostel', discussion_pillar: 'travel-stays', suggested_tags: ['hostel', 'budget'] },
	{ google_type_key: 'bed_and_breakfast', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'bnb', discussion_pillar: 'travel-stays', suggested_tags: ['bnb', 'cozy'] },
	{ google_type_key: 'resort_hotel', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'resort', discussion_pillar: 'travel-stays', suggested_tags: ['resort', 'luxury'] },
	{ google_type_key: 'lodging', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'general-lodging', discussion_pillar: 'travel-stays', suggested_tags: ['stay'] },
	{ google_type_key: 'guest_house', primary_category: 'Lodging', operational_status: 'accommodation', market_niche: 'guesthouse', discussion_pillar: 'travel-stays', suggested_tags: ['guesthouse', 'local'] },

	// ── Services ───────────────────────────────────────────────────────────
	{ google_type_key: 'beauty_salon', primary_category: 'Services', operational_status: 'service', market_niche: 'beauty', discussion_pillar: null, suggested_tags: ['beauty', 'salon'] },
	{ google_type_key: 'hair_salon', primary_category: 'Services', operational_status: 'service', market_niche: 'hair', discussion_pillar: null, suggested_tags: ['hair', 'salon'] },
	{ google_type_key: 'laundry', primary_category: 'Services', operational_status: 'service', market_niche: 'laundry', discussion_pillar: null, suggested_tags: ['laundry'] },

	// ── Entertainment ─────────────────────────────────────────────────────
	{ google_type_key: 'movie_theater', primary_category: 'Entertainment', operational_status: 'venue', market_niche: 'cinema', discussion_pillar: 'culture-arts', suggested_tags: ['cinema', 'movies'] },
	{ google_type_key: 'bowling_alley', primary_category: 'Entertainment', operational_status: 'venue', market_niche: 'bowling', discussion_pillar: null, suggested_tags: ['bowling', 'fun'] },
	{ google_type_key: 'casino', primary_category: 'Entertainment', operational_status: 'venue', market_niche: 'casino', discussion_pillar: 'nightlife', suggested_tags: ['casino', 'entertainment'] },
	{ google_type_key: 'event_venue', primary_category: 'Entertainment', operational_status: 'venue', market_niche: 'events', discussion_pillar: null, suggested_tags: ['events', 'venue'] },
];

export const INTEL_MAPPING_INDEX: Map<string, IntelTagMapping> = new Map(
	MAPPINGS.map((m) => [m.google_type_key, m])
);

export function lookupMapping(googleTypeKey: string): IntelTagMapping | undefined {
	return INTEL_MAPPING_INDEX.get(googleTypeKey);
}

export function getAllMappings(): IntelTagMapping[] {
	return [...MAPPINGS];
}

const DEFAULT_MAPPING: Omit<IntelTagMapping, 'google_type_key'> = {
	primary_category: 'Other',
	operational_status: 'unknown',
	market_niche: 'uncategorized',
	discussion_pillar: null,
	suggested_tags: [],
};

export function getMappingOrDefault(googleTypeKey: string): IntelTagMapping {
	return INTEL_MAPPING_INDEX.get(googleTypeKey) ?? { google_type_key: googleTypeKey, ...DEFAULT_MAPPING };
}
