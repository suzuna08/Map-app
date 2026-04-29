import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const slug = params.slug;

	const { data: raw, error: colErr } = await supabase
		.from('lists')
		.select('*, list_places(place_id, places(id, title, note, url, category, primary_type, rating, rating_count, price_level, address, area, lat, lng, phone, user_rating))')
		.eq('share_slug', slug)
		.eq('visibility', 'link_access')
		.single();

	if (colErr || !raw) {
		error(404, 'Collection not found or is private');
	}

	const { list_places, ...collection } = raw as any;
	let places = (list_places as any[]).map((lp: any) => lp.places).filter(Boolean);

	const shareNotes = collection.share_notes ?? true;
	const sharePhotos = collection.share_photos ?? true;
	const shareTags = collection.share_tags ?? false;

	if (!shareNotes) {
		places = places.map((p: any) => ({ ...p, note: null }));
	}

	const placeIds = places.map((p: any) => p.id as string);

	const fetches: Promise<any>[] = [];

	if (sharePhotos && placeIds.length > 0) {
		fetches.push(
			supabase
				.from('place_photos')
				.select('place_id, storage_path, sort_order')
				.eq('user_id', collection.user_id)
				.in('place_id', placeIds)
				.order('sort_order', { ascending: true })
				.order('created_at', { ascending: true })
		);
	} else {
		fetches.push(Promise.resolve({ data: [] }));
	}

	if (shareTags && placeIds.length > 0) {
		fetches.push(
			supabase
				.from('place_tags')
				.select('place_id, tag_id, tags:tag_id(id, name, color)')
				.in('place_id', placeIds)
		);
	} else {
		fetches.push(Promise.resolve({ data: [] }));
	}

	const [photosRes, tagsRes] = await Promise.all(fetches);

	const placePhotos: Record<string, string[]> = {};
	for (const row of (photosRes.data ?? []) as { place_id: string; storage_path: string }[]) {
		const { data: { publicUrl } } = supabase.storage.from('place-photos').getPublicUrl(row.storage_path);
		(placePhotos[row.place_id] ??= []).push(publicUrl);
	}

	const placeTags: Record<string, { id: string; name: string; color: string | null }[]> = {};
	for (const row of (tagsRes.data ?? []) as { place_id: string; tags: { id: string; name: string; color: string | null } }[]) {
		if (row.tags) {
			(placeTags[row.place_id] ??= []).push(row.tags);
		}
	}

	return {
		collection,
		places,
		placePhotos,
		placeTags,
		shareSettings: { notes: shareNotes, photos: sharePhotos, tags: shareTags },
		session: locals.session
	};
};
