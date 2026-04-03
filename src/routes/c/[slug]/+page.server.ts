import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const slug = params.slug;

	const { data: collection, error: colErr } = await supabase
		.from('lists')
		.select('id, user_id, name, description, color, emoji, visibility, share_slug, created_at, updated_at')
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !collection) {
		error(404, 'Collection not found or is private');
	}

	const { data: memberRows } = await supabase
		.from('list_places')
		.select('place_id')
		.eq('list_id', collection.id);

	const placeIds = (memberRows ?? []).map((r) => r.place_id);

	let places: unknown[] = [];
	if (placeIds.length > 0) {
		const { data } = await supabase
			.from('places')
			.select('id, title, note, url, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, user_rating')
			.in('id', placeIds);
		places = data ?? [];
	}

	let tags: unknown[] = [];
	let placeTags: { place_id: string; tag_id: string }[] = [];

	if (placeIds.length > 0) {
		const placeTagsRes = await supabase
			.from('place_tags')
			.select('place_id, tag_id')
			.in('place_id', placeIds);
		placeTags = (placeTagsRes.data ?? []) as { place_id: string; tag_id: string }[];

		const tagIds = [...new Set(placeTags.map((pt) => pt.tag_id))];
		if (tagIds.length > 0) {
			const tagsRes = await supabase
				.from('tags')
				.select('id, user_id, name, color, source, created_at, order_index')
				.in('id', tagIds)
				.order('name');
			tags = tagsRes.data ?? [];
		}
	}

	return {
		collection,
		places,
		tags,
		placeTags
	};
};
