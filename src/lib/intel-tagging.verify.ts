/**
 * Intel Tagging System — End-to-End Verification
 *
 * Simulates the runtime flow for two Taipei examples:
 *   1. A gym (e.g. World Gym Taipei)
 *   2. A restaurant (e.g. Din Tai Fung)
 *
 * Run with: npx tsx src/lib/intel-tagging.verify.ts
 * (or import and call verifyIntelTagging() from a test)
 */

import { computeIntelTags, buildMarketDiscussionOutput } from './intel-tagging';
import { isKnownGoogleType } from './google-place-types';
import { lookupMapping } from './intel-tag-mappings';

interface VerificationCase {
	label: string;
	primaryType: string;
	types: string[];
	context: {
		name: string;
		place_id: string;
		area: string;
		rating: number;
		price_level: string | null;
	};
}

const cases: VerificationCase[] = [
	{
		label: 'Taipei Gym — World Gym Xinyi',
		primaryType: 'gym',
		types: ['gym', 'fitness_center', 'sports_club', 'health', 'point_of_interest', 'establishment'],
		context: {
			name: 'World Gym Xinyi',
			place_id: 'ChIJexample_gym_taipei',
			area: 'Xinyi District',
			rating: 4.2,
			price_level: '$$',
		},
	},
	{
		label: 'Taipei Restaurant — Din Tai Fung Xinyi',
		primaryType: 'chinese_restaurant',
		types: ['chinese_restaurant', 'restaurant', 'meal_takeaway', 'food', 'point_of_interest', 'establishment'],
		context: {
			name: 'Din Tai Fung Xinyi',
			place_id: 'ChIJexample_dtf_taipei',
			area: 'Xinyi District',
			rating: 4.6,
			price_level: '$$$',
		},
	},
];

export function verifyIntelTagging(): { passed: boolean; results: string[] } {
	const results: string[] = [];
	let allPassed = true;

	for (const c of cases) {
		results.push(`\n=== ${c.label} ===`);

		const catalogCheck = c.types.map((t) => `  ${t}: ${isKnownGoogleType(t) ? 'KNOWN' : 'UNKNOWN'}`);
		results.push('Catalog lookup:', ...catalogCheck);

		const mappingCheck = `  primaryType "${c.primaryType}": ${lookupMapping(c.primaryType) ? 'MAPPED' : 'UNMAPPED'}`;
		results.push('Mapping lookup:', mappingCheck);

		const intel = computeIntelTags(c.primaryType, c.types);
		results.push('Intel result:');
		results.push(`  primary_category:   ${intel.primary_category}`);
		results.push(`  operational_status: ${intel.operational_status}`);
		results.push(`  market_niche:       ${intel.market_niche}`);
		results.push(`  discussion_pillar:  ${intel.discussion_pillar}`);
		results.push(`  suggested_tags:     [${intel.suggested_tags.join(', ')}]`);
		results.push(`  catalog_hits:       [${intel.catalog_hits.join(', ')}]`);
		results.push(`  catalog_misses:     [${intel.catalog_misses.join(', ')}]`);
		results.push(`  primary_type_mapped: ${intel.primary_type_mapped}`);

		const market = buildMarketDiscussionOutput(intel, c.context);
		results.push('Market discussion JSON:');
		results.push(JSON.stringify(market, null, 2));

		const checks = [
			['primary_category is not Other', intel.primary_category !== 'Other'],
			['operational_status is not unknown', intel.operational_status !== 'unknown'],
			['market_niche is not uncategorized', intel.market_niche !== 'uncategorized'],
			['suggested_tags has at least 1 entry', intel.suggested_tags.length >= 1],
			['primary_type_mapped is true', intel.primary_type_mapped === true],
		] as const;

		for (const [desc, ok] of checks) {
			results.push(`  ${ok ? 'PASS' : 'FAIL'}: ${desc}`);
			if (!ok) allPassed = false;
		}
	}

	results.push(`\n${'='.repeat(40)}`);
	results.push(allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');

	return { passed: allPassed, results };
}

// Allow direct execution
const isDirectRun = typeof process !== 'undefined' && process.argv[1]?.includes('intel-tagging.verify');
if (isDirectRun) {
	const { passed, results } = verifyIntelTagging();
	console.log(results.join('\n'));
	process.exit(passed ? 0 : 1);
}
