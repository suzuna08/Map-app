<script lang="ts">
	import type { Place, Tag, Collection } from '$lib/types/database';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import { buildPlaceTagsMap, refreshTagsData } from '$lib/stores/places.svelte';
	import { textColorForBg } from '$lib/tag-colors';
	import {
		updateCollection,
		addPlacesToCollection,
		removePlaceFromCollection,
		enableSharing,
		disableSharing
	} from '$lib/stores/collections.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let serverCollection = $derived((data as any).collection as Collection);
	let serverPlaces = $derived(((data as any).places ?? []) as Place[]);
	let serverPlaceIds = $derived(((data as any).placeIds ?? []) as string[]);
	let serverTags = $derived(((data as any).tags ?? []) as Tag[]);
	let serverPlaceTags = $derived(((data as any).placeTags ?? []) as { place_id: string; tag_id: string }[]);
	let serverAllPlaces = $derived(((data as any).allPlaces ?? []) as Place[]);

	let collection = $state<Collection>(serverCollection);
	let places = $state<Place[]>(serverPlaces);
	let placeIds = $state<string[]>(serverPlaceIds);
	let allTags = $state<Tag[]>(serverTags);
	let placeTagsMap = $state<Record<string, Tag[]>>(buildPlaceTagsMap(serverTags, serverPlaceTags));
	let allPlaces = $state<Place[]>(serverAllPlaces);

	let prevCollectionId = $state(serverCollection?.id);

	$effect(() => {
		if (serverCollection?.id !== prevCollectionId) {
			prevCollectionId = serverCollection?.id;
			collection = serverCollection;
			places = serverPlaces;
			placeIds = serverPlaceIds;
			allTags = serverTags;
			placeTagsMap = buildPlaceTagsMap(serverTags, serverPlaceTags);
			allPlaces = serverAllPlaces;
			editName = serverCollection.name;
			editDesc = serverCollection.description ?? '';
			editingName = false;
			editingDesc = false;
			search = '';
			showAddModal = false;
			addSearch = '';
			addTagFilter = {};
		}
	});

	let toasts = $derived(getToasts());
	let viewMode = $state<'grid' | 'list'>('grid');
	let sortBy = $state<'newest' | 'az' | 'rating'>('newest');
	let search = $state('');
	let showAddModal = $state(false);
	let addSearch = $state('');
	let addTagFilter = $state<Record<string, boolean>>({});
	let editingName = $state(false);
	let editName = $state(serverCollection?.name ?? '');
	let editingDesc = $state(false);
	let editDesc = $state(serverCollection?.description ?? '');

	let editingColor = $state(false);
	let colorPickerEl = $state<HTMLDivElement | null>(null);
	const COLORS = [
		'#A5834F', '#8C8B82', '#7489A6', '#936756', '#5B7D8A',
		'#6A6196'
	];

	$effect(() => {
		if (!editingColor) return;
		function onClickOutside(e: MouseEvent) {
			if (colorPickerEl && !colorPickerEl.contains(e.target as Node)) {
				editingColor = false;
			}
		}
		document.addEventListener('click', onClickOutside, true);
		return () => document.removeEventListener('click', onClickOutside, true);
	});

	async function saveColor(color: string) {
		if (color === collection.color) { editingColor = false; return; }
		const ok = await updateCollection(supabase, collection.id, { color });
		if (ok) {
			collection = { ...collection, color };
			showToast('success', '', 'Color updated');
		}
		editingColor = false;
	}

	async function saveEmoji(emoji: string | null) {
		const prev = collection.emoji;
		collection = { ...collection, emoji };
		const ok = await updateCollection(supabase, collection.id, { emoji });
		if (ok) {
			showToast('success', '', emoji ? `Icon set to ${emoji}` : 'Icon removed');
		} else {
			collection = { ...collection, emoji: prev };
			showToast('error', '', 'Could not save icon — have you run the emoji migration?');
		}
	}

	let selectedPlaceId = $state<string | null>(null);
	let isMobile = $state(false);
	let mapExpanded = $state(true);
	let maptilerKey = $derived(data.maptilerKey ?? '');

	let mappablePlaces = $derived(places.filter((p) => p.lat != null && p.lng != null));
	let hasMap = $derived(mappablePlaces.length > 0);

	$effect(() => {
		function check() { isMobile = window.innerWidth < 1024; }
		check();
		window.addEventListener('resize', check);
		return () => window.removeEventListener('resize', check);
	});

	let filteredPlaces = $derived(
		places.filter((p) => {
			if (!search) return true;
			const s = search.toLowerCase();
			return (
				p.title.toLowerCase().includes(s) ||
				(p.address ?? '').toLowerCase().includes(s) ||
				(p.category ?? '').toLowerCase().includes(s)
			);
		})
	);

	let sortedPlaces = $derived(
		[...filteredPlaces].sort((a, b) => {
			switch (sortBy) {
				case 'az': return a.title.localeCompare(b.title);
				case 'rating': return (b.user_rating ?? 0) - (a.user_rating ?? 0);
				default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			}
		})
	);

	let userTags = $derived(allTags.filter((t) => t.source === 'user').sort((a, b) => a.name.localeCompare(b.name)));
	let addSelectedTagIds = $derived(Object.keys(addTagFilter).filter((id) => addTagFilter[id]));

	let nonMemberPlaces = $derived(
		allPlaces.filter((p) => !placeIds.includes(p.id)).filter((p) => {
			if (addSearch) {
				const s = addSearch.toLowerCase();
				const matchesText = p.title.toLowerCase().includes(s) || (p.area ?? '').toLowerCase().includes(s) || (p.category ?? '').toLowerCase().includes(s);
				if (!matchesText) return false;
			}
			if (addSelectedTagIds.length > 0) {
				const pTagIds = (placeTagsMap[p.id] ?? []).map((t) => t.id);
				if (!addSelectedTagIds.every((id) => pTagIds.includes(id))) return false;
			}
			return true;
		})
	);

	function toggleAddTagFilter(tagId: string) {
		const copy = { ...addTagFilter };
		if (copy[tagId]) { delete copy[tagId]; } else { copy[tagId] = true; }
		addTagFilter = copy;
	}

	async function refreshTags() {
		const userId = session?.user?.id;
		const result = await refreshTagsData(supabase, userId);
		allTags = result.tags;
		placeTagsMap = buildPlaceTagsMap(allTags, result.placeTags);
	}

	async function handleRemovePlace(placeId: string) {
		await removePlaceFromCollection(supabase, collection.id, placeId);
		placeIds = placeIds.filter((id) => id !== placeId);
		places = places.filter((p) => p.id !== placeId);
		showToast('info', '', 'Removed from collection');
	}

	async function handleAddPlace(placeId: string) {
		if (placeIds.includes(placeId)) return;
		await addPlacesToCollection(supabase, collection.id, [placeId]);
		placeIds = [...placeIds, placeId];
		const fullPlace = allPlaces.find((p) => p.id === placeId);
		if (fullPlace) {
			const { data: placeData } = await supabase
				.from('places')
				.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at')
				.eq('id', placeId)
				.single();
			if (placeData) places = [...places, placeData as Place];
		}
		showToast('success', '', 'Added to collection');
	}

	async function handleAddMultiple(ids: string[]) {
		const newIds = ids.filter((id) => !placeIds.includes(id));
		if (newIds.length === 0) return;
		await addPlacesToCollection(supabase, collection.id, newIds);
		placeIds = [...placeIds, ...newIds];
		const { data: newPlaces } = await supabase
			.from('places')
			.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at')
			.in('id', newIds);
		if (newPlaces) places = [...places, ...(newPlaces as Place[])];
		showToast('success', '', `Added ${newIds.length} places`);
		showAddModal = false;
	}

	async function saveName() {
		const trimmed = editName.trim();
		if (!trimmed || trimmed === collection.name) { editingName = false; return; }
		const ok = await updateCollection(supabase, collection.id, { name: trimmed });
		if (ok) { collection = { ...collection, name: trimmed }; }
		editingName = false;
	}

	async function saveDescription() {
		const trimmed = editDesc.trim();
		if (trimmed === (collection.description ?? '')) { editingDesc = false; return; }
		const ok = await updateCollection(supabase, collection.id, { description: trimmed || undefined });
		if (ok) { collection = { ...collection, description: trimmed || null }; }
		editingDesc = false;
	}

	async function toggleSharing() {
		if (collection.visibility === 'link_access') {
			const ok = await disableSharing(supabase, collection.id);
			if (ok) {
				collection = { ...collection, visibility: 'private', share_slug: null };
				showToast('info', '', 'Sharing disabled');
			}
		} else {
			const slug = await enableSharing(supabase, collection.id);
			if (slug) {
				collection = { ...collection, visibility: 'link_access', share_slug: slug };
				showToast('success', '', 'Sharing enabled');
			}
		}
	}

	function copyShareLink() {
		if (!collection.share_slug) return;
		const url = `${window.location.origin}/c/${collection.share_slug}`;
		navigator.clipboard.writeText(url);
		showToast('success', '', 'Link copied to clipboard');
	}

	function handleCardSelect(placeId: string) {
		selectedPlaceId = selectedPlaceId === placeId ? null : placeId;
	}

	function handleMapPlaceSelect(placeId: string) {
		selectedPlaceId = placeId;
		requestAnimationFrame(() => {
			const els = document.querySelectorAll(`[data-place-id="${placeId}"]`);
			for (const el of els) {
				if (el instanceof HTMLElement && el.offsetParent !== null) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					break;
				}
			}
		});
	}

	function updateNote(placeId: string, note: string) {
		places = places.map((p) => (p.id === placeId ? { ...p, note } : p));
	}

	function updateRating(placeId: string, rating: number | null) {
		places = places.map((p) =>
			p.id === placeId
				? { ...p, user_rating: rating, user_rated_at: rating != null ? new Date().toISOString() : null }
				: p
		);
	}

	function toggleTag(_tagId: string) { /* noop on collection detail */ }
</script>

<svelte:head>
	<title>{collection?.name ?? 'Collection'} — MapOrganizer</title>
</svelte:head>

<!-- Sticky top panel: header + map -->
{#if collection}
<div class="sticky top-12 z-10 border-b border-warm-200/80 bg-[#faf7f2] shadow-sm sm:top-14">
	<div class="mx-auto max-w-4xl px-3 sm:px-6">
		<!-- Breadcrumb + Header combined -->
		<div class="flex items-center gap-1.5 pt-2 text-[11px] text-warm-400 sm:pt-2.5 sm:text-[13px]">
			<a href="/collections" class="transition-colors hover:text-warm-600">Collections</a>
			<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
			<span class="font-semibold text-warm-600">{collection.name}</span>
		</div>

		<!-- Header -->
		<div class="pb-2 pt-1 sm:pb-2.5 sm:pt-1.5">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2.5">
						<div class="relative" bind:this={colorPickerEl}>
						<button
							onclick={() => { editingColor = !editingColor; }}
							class="flex shrink-0 items-center justify-center rounded-full transition-all hover:scale-110"
							aria-label="Change collection color"
						>
							<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" />
						</button>
						{#if editingColor}
							<div class="absolute left-0 top-full z-20 mt-2 rounded-xl border border-warm-200 bg-white p-2.5 shadow-lg" style="width: max-content; max-width: 280px;">
								<div class="flex flex-wrap gap-1.5">
									{#each COLORS as color}
										<button
											onclick={() => saveColor(color)}
											class="h-5.5 w-5.5 rounded-full transition-all {collection.color === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
											style="background-color: {color}"
											aria-label="Select color"
										></button>
									{/each}
								</div>
							<div class="mt-2 border-t border-warm-100 pt-2">
								<span class="mb-1 block text-[10px] font-bold text-warm-400">Icon</span>
								<EmojiPicker selected={collection.emoji ?? null} onSelect={(em) => { saveEmoji(em); }} />
							</div>
							</div>
						{/if}
						</div>
						<div class="min-w-0 flex-1">
							{#if editingName}
								<input
									type="text"
									bind:value={editName}
									onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }}
									onblur={saveName}
									class="w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-base font-extrabold text-warm-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:text-lg"
									autofocus
								/>
							{:else}
								<button
									type="button"
									class="cursor-pointer truncate text-left text-base font-extrabold text-warm-800 transition-colors hover:text-brand-600 sm:text-lg"
									onclick={() => { editingName = true; editName = collection.name; }}
								>
									{collection.name}
								</button>
							{/if}
							{#if editingDesc}
								<input
									type="text"
									bind:value={editDesc}
									onkeydown={(e) => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') editingDesc = false; }}
									onblur={saveDescription}
									placeholder="Add a description..."
									class="mt-0.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-[11px] text-warm-500 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:text-[13px]"
									autofocus
								/>
							{:else}
								<button
									type="button"
									class="mt-0.5 cursor-pointer text-left text-[11px] text-warm-400 transition-colors hover:text-warm-500 sm:text-[13px]"
									onclick={() => { editingDesc = true; editDesc = collection.description ?? ''; }}
								>
									{collection.description || 'Add a description...'}
								</button>
							{/if}
						</div>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
					{#if collection.visibility === 'link_access'}
						<button
							onclick={copyShareLink}
							class="rounded-md p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 sm:p-2"
							aria-label="Copy share link"
						>
							<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
								<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
							</svg>
						</button>
					{/if}
					<button
						onclick={toggleSharing}
						class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors sm:px-3 sm:py-1.5 sm:text-xs
							{collection.visibility === 'link_access'
								? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100'
								: 'border-warm-200 text-warm-500 hover:bg-warm-50'}"
					>
						<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							{#if collection.visibility === 'link_access'}
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
							{:else}
								<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
								<line x1="1" y1="1" x2="23" y2="23" />
							{/if}
						</svg>
						{collection.visibility === 'link_access' ? 'Shared' : 'Private'}
					</button>
					<button
						onclick={() => { showAddModal = true; }}
						class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm"
					>
						<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						<span class="hidden sm:inline">Add Places</span>
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Map (inside sticky panel) -->
	{#if hasMap}
		<div class="mx-auto max-w-4xl px-3 pb-2 sm:px-6 sm:pb-2.5">
			<div class="overflow-hidden rounded-xl border border-warm-200 sm:rounded-2xl">
				<button
					onclick={() => { mapExpanded = !mapExpanded; }}
					class="flex w-full items-center justify-between bg-white px-3 py-1.5 text-[11px] font-semibold text-warm-500 transition-colors hover:bg-warm-50 sm:px-4 sm:py-2 sm:text-xs"
				>
					<div class="flex items-center gap-2">
						<svg class="h-3.5 w-3.5 text-brand-500 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
						</svg>
						<span>{mappablePlaces.length} {mappablePlaces.length === 1 ? 'place' : 'places'} on map</span>
					</div>
					<svg
						class="h-3.5 w-3.5 transition-transform duration-200 {mapExpanded ? 'rotate-180' : ''}"
						viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>

				{#if mapExpanded}
					<div class="h-[180px] border-t border-warm-200 sm:h-[220px]">
						<MapView
							places={filteredPlaces}
							{selectedPlaceId}
							onPlaceSelect={handleMapPlaceSelect}
							{maptilerKey}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Controls (inside sticky panel) -->
	<div class="mx-auto flex max-w-4xl items-center justify-between border-t border-warm-200/60 px-3 py-1.5 sm:px-6 sm:py-2">
		<p class="text-xs font-semibold text-warm-500 sm:text-[15px]">{filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'}</p>
		<div class="flex items-center gap-1.5 sm:gap-2">
			<div class="relative">
				<svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="text"
					bind:value={search}
					placeholder="Search..."
					class="w-28 rounded-lg border border-warm-200 bg-warm-50 py-1 pl-7 pr-7 text-[11px] font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:w-40 sm:text-[13px]"
				/>
				{#if search}
					<button
						onclick={() => { search = ''; }}
						class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600"
						aria-label="Clear search"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				{/if}
			</div>
			<select
				bind:value={sortBy}
				class="rounded-md border border-warm-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-warm-600 focus:border-brand-400 focus:outline-none sm:text-[13px]"
			>
				<option value="newest">Recent</option>
				<option value="az">A–Z</option>
				<option value="rating">My Rating</option>
			</select>
			<div class="flex items-center gap-0.5 rounded-md border border-warm-200 bg-white p-0.5">
				<button
					onclick={() => { viewMode = 'grid'; }}
					class="rounded p-1.5 transition-colors {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
					aria-label="Grid view"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
					</svg>
				</button>
				<button
					onclick={() => { viewMode = 'list'; }}
					class="rounded p-1.5 transition-colors {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
					aria-label="List view"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
						<line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>

<div class="mx-auto max-w-4xl px-3 pb-8 pt-3 sm:px-6 sm:pb-12 sm:pt-4">
	<!-- Places -->
	{#if sortedPlaces.length === 0}
		<div class="py-16 text-center">
			<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
			</svg>
			<p class="mt-3 text-[15px] text-warm-500">
				{places.length === 0 ? 'This collection is empty' : 'No places match your search'}
			</p>
			{#if places.length === 0}
				<button
					onclick={() => { showAddModal = true; }}
					class="mt-2 text-[15px] font-semibold text-brand-600 hover:text-brand-700"
				>
					Add some places
				</button>
			{/if}
		</div>
	{:else if viewMode === 'grid'}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
			{#each sortedPlaces as place (place.id)}
				<PlaceCard
					{place}
					placeTags={placeTagsMap[place.id] ?? []}
					{allTags}
					{supabase}
					userId={session?.user?.id ?? ''}
					enrichingId={null}
					onEnrich={() => {}}
					onDelete={() => handleRemovePlace(place.id)}
					onTagClick={toggleTag}
					onTagsChanged={refreshTags}
					onNoteChanged={updateNote}
					onRatingChanged={updateRating}
					selected={selectedPlaceId === place.id}
					onSelect={handleCardSelect}
				/>
			{/each}
		</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100">
			{#each sortedPlaces as place (place.id)}
				<PlaceListItem
					{place}
					placeTags={placeTagsMap[place.id] ?? []}
					{allTags}
					{supabase}
					userId={session?.user?.id ?? ''}
					onTagClick={toggleTag}
					onTagsChanged={refreshTags}
					onNoteChanged={updateNote}
					onRatingChanged={updateRating}
					onDelete={() => handleRemovePlace(place.id)}
					selected={selectedPlaceId === place.id}
					onSelect={handleCardSelect}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Add places modal -->
{#if showAddModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; }}>
		<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
		<div
			class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
				<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {collection.name}</h2>
				<button onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<!-- Search bar -->
			<div class="border-b border-warm-100 px-4 py-2">
				<div class="relative">
					<svg class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						bind:value={addSearch}
						placeholder="Search your places..."
						class="w-full rounded-lg border border-warm-200 bg-warm-50 py-1.5 pl-8 pr-3 text-sm font-medium text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
						autofocus
					/>
				</div>

				<!-- Tag filter pills -->
				{#if userTags.length > 0}
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						<span class="text-[10px] font-semibold text-warm-400">Tags:</span>
						{#each userTags as tag (tag.id)}
							<button
								onclick={() => toggleAddTagFilter(tag.id)}
							class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all
								{addTagFilter[tag.id]
									? 'shadow-sm ring-1 ring-offset-1'
									: 'opacity-60 hover:opacity-90'}"
							style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}; {addTagFilter[tag.id] ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
							>
								{tag.name}
								{#if addTagFilter[tag.id]}
									<svg class="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								{/if}
							</button>
						{/each}
						{#if addSelectedTagIds.length > 0}
							<button
								onclick={() => { addTagFilter = {}; }}
								class="text-[10px] font-medium text-warm-400 hover:text-warm-600"
							>Clear</button>
						{/if}
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto px-2 py-2 sm:px-3">
				{#each nonMemberPlaces as p (p.id)}
					{@const pTags = (placeTagsMap[p.id] ?? []).filter((t) => t.source === 'user')}
					<button
						onclick={() => handleAddPlace(p.id)}
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50"
					>
						<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{p.title}</p>
							<div class="flex items-center gap-1.5">
								<span class="shrink-0 truncate text-[11px] text-warm-400">{p.area ? `${p.area} · ` : ''}{p.category ?? ''}</span>
								{#if pTags.length > 0}
									<span class="text-warm-300">·</span>
									{#each pTags.slice(0, 2) as tag (tag.id)}
									<span
										class="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold"
										style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}"
										>{tag.name}</span>
									{/each}
									{#if pTags.length > 2}
										<span class="text-[9px] font-bold text-warm-400">+{pTags.length - 2}</span>
									{/if}
								{/if}
							</div>
						</div>
					{#if p.user_rating}
						<span class="shrink-0 text-xs font-bold text-warm-500"><span class="text-brand-500">★</span> {p.user_rating.toFixed(1)}</span>
					{/if}
					</button>
				{:else}
					<p class="py-8 text-center text-sm text-warm-400">
						{addSearch ? 'No matching places' : 'All your places are already in this collection'}
					</p>
				{/each}
			</div>
		</div>
	</div>
{/if}
{/if}

<!-- Toasts -->
{#if toasts.length > 0}
	<div class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8">
		{#each toasts as toast (toast.id)}
			<div
				class="flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in
					{toast.type === 'success' ? 'border border-sage-200/60 bg-sage-50/95 text-sage-800' : ''}
					{toast.type === 'error' ? 'border border-red-200/60 bg-red-50/95 text-red-700' : ''}
					{toast.type === 'info' ? 'border border-blue-200/60 bg-blue-50/95 text-blue-800' : ''}"
			>
				<span class="text-xs font-medium sm:text-sm">{toast.message}</span>
			</div>
		{/each}
	</div>
{/if}
