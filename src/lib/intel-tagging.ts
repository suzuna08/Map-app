/**
 * Intel Tagging Engine
 *
 * Runtime computation layer that takes raw Google Place data (primaryType +
 * types array) and produces structured intelligence output. This is the core
 * bridge between Google's external taxonomy and the app's internal product
 * model.
 *
 * Output layers:
 *   1. Primary Category    — top-level bucket for the place
 *   2. Operational Status  — business model signal
 *   3. Market Niche        — finer market positioning
 *   4. Discussion Pillar   — optional prompt anchor for market discussions
 *   5. Suggested Tags      — deduplicated tag proposals
 *   6. Catalog Metadata    — which types were recognized vs unknown
 *
 * The engine is pure computation — no side effects, no database writes.
 * Persistence decisions are left to the caller.
 */

import { isKnownGoogleType, lookupGoogleType, type GooglePlaceTypeEntry } from './google-place-types';
import { getMappingOrDefault, lookupMapping, type IntelTagMapping } from './intel-tag-mappings';

export interface IntelTagResult {
	primary_category: string;
	operational_status: string;
	market_niche: string;
	discussion_pillar: string | null;
	suggested_tags: string[];

	catalog_hits: string[];
	catalog_misses: string[];
	primary_type_mapped: boolean;
	all_mappings: IntelTagMapping[];
	source_types: string[];
	source_primary_type: string | null;
}

export interface MarketDiscussionOutput {
	place_name: string;
	place_id: string | null;
	area: string | null;
	primary_category: string;
	operational_status: string;
	market_niche: string;
	discussion_pillar: string | null;
	suggested_tags: string[];
	rating: number | null;
	price_level: string | null;
	google_types: string[];
	primary_type: string | null;
}

/**
 * Compute intel tags from raw Google place type data.
 *
 * The resolution strategy:
 *   1. If `primaryType` has a mapping, use it as the authoritative source
 *   2. Otherwise, scan `types` in order and use the first mapped type
 *   3. Aggregate suggested_tags from all matched mappings (deduplicated)
 *   4. Record catalog hit/miss metadata for observability
 */
export function computeIntelTags(
	primaryType: string | null | undefined,
	types: string[]
): IntelTagResult {
	const catalogHits: string[] = [];
	const catalogMisses: string[] = [];

	for (const t of types) {
		if (isKnownGoogleType(t)) {
			catalogHits.push(t);
		} else {
			catalogMisses.push(t);
		}
	}

	if (primaryType) {
		if (isKnownGoogleType(primaryType) && !catalogHits.includes(primaryType)) {
			catalogHits.push(primaryType);
		} else if (!isKnownGoogleType(primaryType) && !catalogMisses.includes(primaryType)) {
			catalogMisses.push(primaryType);
		}
	}

	const allMappings: IntelTagMapping[] = [];
	let authoritative: IntelTagMapping | undefined;

	if (primaryType) {
		const m = lookupMapping(primaryType);
		if (m) {
			authoritative = m;
			allMappings.push(m);
		}
	}

	for (const t of types) {
		const m = lookupMapping(t);
		if (m && !allMappings.some((a) => a.google_type_key === t)) {
			allMappings.push(m);
			if (!authoritative) authoritative = m;
		}
	}

	const resolved = authoritative ?? getMappingOrDefault(primaryType ?? types[0] ?? 'unknown');

	const tagSet = new Set<string>();
	for (const m of allMappings) {
		for (const tag of m.suggested_tags) {
			tagSet.add(tag);
		}
	}

	return {
		primary_category: resolved.primary_category,
		operational_status: resolved.operational_status,
		market_niche: resolved.market_niche,
		discussion_pillar: resolved.discussion_pillar,
		suggested_tags: [...tagSet],

		catalog_hits: catalogHits,
		catalog_misses: catalogMisses,
		primary_type_mapped: authoritative !== undefined && primaryType !== null,
		all_mappings: allMappings,
		source_types: types,
		source_primary_type: primaryType ?? null,
	};
}

/**
 * Build a prompt-ready JSON payload for downstream market discussion use cases.
 */
export function buildMarketDiscussionOutput(
	intelResult: IntelTagResult,
	placeContext: {
		name: string;
		place_id: string | null;
		area: string | null;
		rating: number | null;
		price_level: string | null;
	}
): MarketDiscussionOutput {
	return {
		place_name: placeContext.name,
		place_id: placeContext.place_id,
		area: placeContext.area,
		primary_category: intelResult.primary_category,
		operational_status: intelResult.operational_status,
		market_niche: intelResult.market_niche,
		discussion_pillar: intelResult.discussion_pillar,
		suggested_tags: intelResult.suggested_tags,
		rating: placeContext.rating,
		price_level: placeContext.price_level,
		google_types: intelResult.source_types,
		primary_type: intelResult.source_primary_type,
	};
}
