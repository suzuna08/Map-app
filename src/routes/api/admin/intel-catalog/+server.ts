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

	let catalogUpserted = 0;
	let mappingsUpserted = 0;
	const errors: string[] = [];

	const catalogRows = GOOGLE_PLACE_TYPE_CATALOG.map((entry) => ({
		type_key: entry.type_key,
		can_be_primary: entry.can_be_primary,
		table_group: entry.table_group,
		status: entry.status,
	}));

	const mappingRows = getAllMappings().map((m) => ({
		google_type_key: m.google_type_key,
		primary_category: m.primary_category,
		operational_status: m.operational_status,
		market_niche: m.market_niche,
		discussion_pillar: m.discussion_pillar,
		suggested_tags: m.suggested_tags,
	}));

	const [catalogResult, mappingsResult] = await Promise.all([
		locals.supabase
			.from('google_place_type_catalog')
			.upsert(catalogRows, { onConflict: 'type_key' }),
		locals.supabase
			.from('intel_tag_mappings')
			.upsert(mappingRows as any[], { onConflict: 'google_type_key' }),
	]);

	if (catalogResult.error) errors.push(`catalog: ${catalogResult.error.message}`);
	else catalogUpserted = catalogRows.length;

	if (mappingsResult.error) errors.push(`mappings: ${mappingsResult.error.message}`);
	else mappingsUpserted = mappingRows.length;

	return json({
		mode,
		catalog: { upserted: catalogUpserted, total: GOOGLE_PLACE_TYPE_CATALOG.length },
		mappings: { upserted: mappingsUpserted, total: getAllMappings().length },
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
