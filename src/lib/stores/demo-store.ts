import { writable, derived } from 'svelte/store';
import { colorForTag } from '$lib/tag-colors';

export interface DemoPlace {
	id: string;
	user_id: string;
	title: string;
	note: string | null;
	url: string | null;
	tags: string | null;
	comment: string | null;
	source_list: string | null;
	created_at: string;
	google_place_id: string | null;
	category: string | null;
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
	enriched_at: string | null;
	user_rating: number | null;
	user_rated_at: string | null;
}

export interface DemoTag {
	id: string;
	name: string;
	color: string;
}

export const demoPlaces = writable<DemoPlace[]>([]);
export const demoTags = writable<DemoTag[]>([]);
export const demoPlaceTags = writable<Record<string, string[]>>({});
export const activeTagFilter = writable<Set<string>>(new Set());

export const filteredDemoPlaces = derived(
	[demoPlaces, activeTagFilter, demoPlaceTags],
	([$places, $filter, $placeTags]) => {
		if ($filter.size === 0) return $places;
		return $places.filter((p) => {
			const tagIds = $placeTags[p.id] ?? [];
			return tagIds.some((tid) => $filter.has(tid));
		});
	}
);

export function addDemoPlace(placeData: {
	id: string;
	title: string;
	url: string;
	google_place_id: string | null;
	category: string | null;
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
}): void {
	const place: DemoPlace = {
		...placeData,
		user_id: 'demo',
		note: null,
		tags: null,
		comment: null,
		source_list: 'demo',
		created_at: new Date().toISOString(),
		enriched_at: new Date().toISOString(),
		user_rating: null,
		user_rated_at: null,
	};
	demoPlaces.update((list) => [place, ...list]);
}

export function removeDemoPlace(placeId: string): void {
	demoPlaces.update((list) => list.filter((p) => p.id !== placeId));
	demoPlaceTags.update((map) => {
		const copy = { ...map };
		delete copy[placeId];
		return copy;
	});
}

export function addDemoTag(name: string): DemoTag {
	const tag: DemoTag = {
		id: crypto.randomUUID(),
		name,
		color: colorForTag(name),
	};
	demoTags.update((list) => [...list, tag]);
	return tag;
}

export function removeDemoTag(tagId: string): void {
	demoTags.update((list) => list.filter((t) => t.id !== tagId));
	demoPlaceTags.update((map) => {
		const copy: Record<string, string[]> = {};
		for (const [pid, tids] of Object.entries(map)) {
			copy[pid] = tids.filter((t) => t !== tagId);
		}
		return copy;
	});
	activeTagFilter.update((set) => {
		const next = new Set(set);
		next.delete(tagId);
		return next;
	});
}

export function togglePlaceTag(placeId: string, tagId: string): void {
	demoPlaceTags.update((map) => {
		const current = map[placeId] ?? [];
		const has = current.includes(tagId);
		return {
			...map,
			[placeId]: has ? current.filter((t) => t !== tagId) : [...current, tagId],
		};
	});
}

export function toggleTagFilter(tagId: string): void {
	activeTagFilter.update((set) => {
		const next = new Set(set);
		if (next.has(tagId)) next.delete(tagId);
		else next.add(tagId);
		return next;
	});
}

export function clearTagFilter(): void {
	activeTagFilter.set(new Set());
}

export function ensureSuggestedTags(suggestedNames: string[]): DemoTag[] {
	const created: DemoTag[] = [];
	demoTags.update((existing) => {
		const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
		const toAdd: DemoTag[] = [];
		for (const name of suggestedNames) {
			if (!existingNames.has(name.toLowerCase())) {
				const tag: DemoTag = { id: crypto.randomUUID(), name, color: colorForTag(name) };
				toAdd.push(tag);
				existingNames.add(name.toLowerCase());
			}
		}
		created.push(...toAdd);
		return [...existing, ...toAdd];
	});
	return created;
}

export interface DemoSavedView {
	id: string;
	name: string;
	tagIds: string[];
}

export const demoSavedViews = writable<DemoSavedView[]>([]);

export function addSavedView(name: string, tagIds: string[]): void {
	if (tagIds.length === 0) return;
	const view: DemoSavedView = { id: crypto.randomUUID(), name, tagIds: [...tagIds] };
	demoSavedViews.update((list) => [...list, view]);
}

export function removeSavedView(viewId: string): void {
	demoSavedViews.update((list) => list.filter((v) => v.id !== viewId));
}

export function applySavedView(view: DemoSavedView): void {
	activeTagFilter.set(new Set(view.tagIds));
}

export function resetDemo(): void {
	demoPlaces.set([]);
	demoTags.set([]);
	demoPlaceTags.set({});
	activeTagFilter.set(new Set());
	demoSavedViews.set([]);
}
