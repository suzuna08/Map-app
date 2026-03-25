import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GOOGLE_PLACE_TYPE_CATALOG } from '$lib/google-place-types';
import { getAllMappings } from '$lib/intel-tag-mappings';

/**
 * POST /api/admin/intel-catalog
 *
 * Seeds or refreshes the Supabase google_place_type_catalog and
 * intel_tag_mappings tables from the TypeScript seed data.
 *
 * This is an admin-only operation. In production, gate this behind
 * a service-role key or admin check.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => ({}));
	const mode = (body as Record<string, unknown>).mode === 'full' ? 'full' : 'upsert';

	let catalogInserted = 0;
	let catalogSkipped = 0;
	let mappingsInserted = 0;
	let mappingsSkipped = 0;
	const errors: string[] = [];

	for (const entry of GOOGLE_PLACE_TYPE_CATALOG) {
		try {
			const { data: existing } = await locals.supabase
				.from('google_place_type_catalog')
				.select('id')
				.eq('type_key', entry.type_key)
				.single();

			if (existing && mode === 'upsert') {
				await locals.supabase
					.from('google_place_type_catalog')
					.update({
						can_be_primary: entry.can_be_primary,
						table_group: entry.table_group,
						status: entry.status,
						updated_at: new Date().toISOString(),
					})
					.eq('type_key', entry.type_key);
				catalogSkipped++;
			} else if (!existing) {
				await locals.supabase
					.from('google_place_type_catalog')
					.insert({
						type_key: entry.type_key,
						can_be_primary: entry.can_be_primary,
						table_group: entry.table_group,
						status: entry.status,
					});
				catalogInserted++;
			} else {
				catalogSkipped++;
			}
		} catch (e) {
			errors.push(`catalog:${entry.type_key}: ${e instanceof Error ? e.message : 'unknown'}`);
		}
	}

	for (const mapping of getAllMappings()) {
		try {
			const { data: existing } = await locals.supabase
				.from('intel_tag_mappings')
				.select('id')
				.eq('google_type_key', mapping.google_type_key)
				.single();

			if (existing && mode === 'upsert') {
				await locals.supabase
					.from('intel_tag_mappings')
					.update({
						primary_category: mapping.primary_category,
						operational_status: mapping.operational_status,
						market_niche: mapping.market_niche,
						discussion_pillar: mapping.discussion_pillar,
						suggested_tags: mapping.suggested_tags,
						updated_at: new Date().toISOString(),
					} as any)
					.eq('google_type_key', mapping.google_type_key);
				mappingsSkipped++;
			} else if (!existing) {
				await locals.supabase
					.from('intel_tag_mappings')
					.insert({
						google_type_key: mapping.google_type_key,
						primary_category: mapping.primary_category,
						operational_status: mapping.operational_status,
						market_niche: mapping.market_niche,
						discussion_pillar: mapping.discussion_pillar,
						suggested_tags: mapping.suggested_tags,
					} as any);
				mappingsInserted++;
			} else {
				mappingsSkipped++;
			}
		} catch (e) {
			errors.push(`mapping:${mapping.google_type_key}: ${e instanceof Error ? e.message : 'unknown'}`);
		}
	}

	return json({
		mode,
		catalog: { inserted: catalogInserted, updated_or_skipped: catalogSkipped, total: GOOGLE_PLACE_TYPE_CATALOG.length },
		mappings: { inserted: mappingsInserted, updated_or_skipped: mappingsSkipped, total: getAllMappings().length },
		errors,
	});
};

/**
 * GET /api/admin/intel-catalog
 *
 * Returns current catalog and mapping stats for observability.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const session = locals.session;
	const user = locals.user ?? session?.user;
	if (!session || !user) {
		throw error(401, 'Unauthorized');
	}

	return json({
		seed_data: {
			catalog_entries: GOOGLE_PLACE_TYPE_CATALOG.length,
			mapping_entries: getAllMappings().length,
		},
		mappings_sample: getAllMappings().slice(0, 5),
	});
};
