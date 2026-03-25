<script lang="ts">
	import type { Place, Tag, Collection, BrowseScope, SavedView, SavedViewFilters } from '$lib/types/database';
	import TagSidebar from '$lib/components/TagSidebar.svelte';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import TagManager from '$lib/components/TagManager.svelte';
	import TagContextMenu from '$lib/components/TagContextMenu.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import MobileMapShell from '$lib/components/MobileMapShell.svelte';
	import SavedViewsBar from '$lib/components/SavedViewsBar.svelte';
	import AddToCollectionModal from '$lib/components/AddToCollectionModal.svelte';
	import { sortable } from '$lib/actions/sortable';
	import { saveTagOrder } from '$lib/tag-order';
	import { getToasts, showToast, dismissToast } from '$lib/stores/toasts.svelte';
	import { loadPlacesData, refreshTagsData, buildPlaceTagsMap, removeTagsFromPlace, applyTagsToPlace } from '$lib/stores/places.svelte';
	import { loadCollections, addPlaceToCollection, addPlacesToCollection, removePlaceFromCollection, isPlaceInCollection, optimisticAdd, optimisticRemove, createCollection } from '$lib/stores/collections.svelte';
	import { loadSavedViews, updateSavedView, buildFiltersSnapshot } from '$lib/stores/saved-views.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	function initFromServer() {
		const d = data as any;
		if (d.serverPlaces?.length !== undefined) {
			const tags = (d.serverTags ?? []) as Tag[];
			const ptMap = buildPlaceTagsMap(tags, (d.serverPlaceTags ?? []) as { place_id: string; tag_id: string }[]);
			const colls = (d.serverCollections ?? []) as Collection[];
			const cpm: CollectionMemberMap = {};
			for (const row of ((d.serverListPlaces ?? []) as { list_id: string; place_id: string }[])) {
				(cpm[row.list_id] ??= []).push(row.place_id);
			}
			return {
				places: (d.serverPlaces ?? []) as Place[],
				tags,
				ptMap,
				colls,
				cpm,
				loaded: true
			};
		}
		return { places: [] as Place[], tags: [] as Tag[], ptMap: {} as Record<string, Tag[]>, colls: [] as Collection[], cpm: {} as CollectionMemberMap, loaded: false };
	}

	const serverData = initFromServer();
	let places = $state<Place[]>(serverData.places);
	let allTags = $state<Tag[]>(serverData.tags);
	let placeTagsMap = $state<Record<string, Tag[]>>(serverData.ptMap);
	let loading = $state(!serverData.loaded);
	let search = $state('');
	let selectedTagMap = $state<Record<string, boolean>>({});
	let selectedSource = $state('all');
	let enriching = $state(false);
	let enrichingId = $state<string | null>(null);
	let enrichResult = $state<{ enriched: number; total: number } | null>(null);
	let sidebarOpen = $state(false);
	let showTagManager = $state(false);
	
	let viewMode = $state<'grid' | 'list'>('grid');
	let sortBy = $state<'newest' | 'oldest' | 'az' | 'za' | 'rating' | 'most-tags' | 'tag-group'>('newest');
	let mobileTagTab = $state<'category' | 'area' | 'custom'>('category');
	let contextMenuTag = $state<Tag | null>(null);
	let contextMenuPos = $state({ x: 0, y: 0 });

	let selectedPlaceId = $state<string | null>(null);

	let collections = $state<Collection[]>(serverData.colls);
	let collectionPlacesMap = $state<CollectionMemberMap>(serverData.cpm);
	let browseScope = $state<BrowseScope>({ type: 'all' });
	let collectionPickerPlaceId = $state<string | null>(null);
	let showAddToCollection = $state(false);

	let urlAdding = $state(false);
	let toasts = $derived(getToasts());
	let searchInputEl = $state<HTMLInputElement | null>(null);

	let autoApplyCurrentViewTags = $state(true);

	let savedViews = $state<SavedView[]>([]);
	let activeSavedViewId = $state<string | null>(null);

	let isMobile = $state(false);

	$effect(() => {
		function checkMobile() {
			isMobile = window.innerWidth < 1024;
		}
		checkMobile();
		window.addEventListener('resize', checkMobile);

		function handleExternalPlaceAdded() {
			loadData();
		}
		window.addEventListener('place-added', handleExternalPlaceAdded);

		return () => {
			window.removeEventListener('resize', checkMobile);
			window.removeEventListener('place-added', handleExternalPlaceAdded);
		};
	});

	function isGoogleMapsUrl(text: string): boolean {
		const t = text.trim();
		return /^https?:\/\/(maps\.google\.|www\.google\.\w+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|share\.google\/)/i.test(t);
	}

	let detectedUrl = $derived(isGoogleMapsUrl(search) ? search.trim() : null);

	async function removeContextTagsFromPlace(placeId: string, tagIds: string[]) {
		await removeTagsFromPlace(supabase, placeId, tagIds);
		await loadData();
		showToast('info', '', 'Tags removed');
	}

	async function applyContextTagsToPlace(placeId: string, tagIds: string[]) {
		await applyTagsToPlace(supabase, placeId, tagIds);
		await loadData();
		showToast('success', '', 'Tagged to current view');
	}

	function wouldPlaceBeVisibleInCurrentView(placeId: string): boolean {
		const pTags = placeTagsMap[placeId] ?? [];
		const pTagIds = pTags.map((t) => t.id);
		const matchesCategory =
			selectedCategoryIds.length === 0 ||
			selectedCategoryIds.some((id) => pTagIds.includes(id));
		const matchesArea =
			selectedAreaIds.length === 0 ||
			selectedAreaIds.some((id) => pTagIds.includes(id));
		const matchesCustom =
			selectedCustomIds.length === 0 ||
			selectedCustomIds.every((id) => pTagIds.includes(id));
		const matchesSource = selectedSource === 'all';
		return matchesCategory && matchesArea && matchesCustom && matchesSource;
	}

	async function addPlaceFromUrl() {
		if (!detectedUrl || urlAdding) return;
		const url = search.trim();
		const shouldApply = autoApplyCurrentViewTags && hasCustomContext;
		const tagIdsToApply = shouldApply ? [...selectedCustomIds] : [];
		const tagNamesToApply = shouldApply ? [...selectedCustomTagNames] : [];
		const tagLabel = tagNamesToApply.join(' + ');

		console.log('[addPlace] submitting url:', url, '| contextTags:', tagIdsToApply.length, '| autoApply:', shouldApply);
		urlAdding = true;
		try {
			const res = await fetch('/api/places/add-by-url', {
				method: 'POST',
				cache: 'no-store',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache'
				},
				body: JSON.stringify({
					url,
					contextTagIds: tagIdsToApply,
					autoApplyContextTags: shouldApply
				})
			});
			const result = await res.json();
			console.log('[addPlace] response:', res.status, result.duplicate, result.place?.title, 'tagsApplied:', result.contextTagsApplied);

			if (!res.ok) {
				showToast('error', '', result.message || result.error?.message || 'Could not add this place');
				urlAdding = false;
				searchInputEl?.focus();
				return;
			}

			const place = result.place as Place;
			const tagsApplied = result.contextTagsApplied ?? 0;
			const tagsRequested = result.contextTagsRequested ?? 0;

			if (result.duplicate) {
				if (shouldApply && tagsApplied > 0) {
					showToast('success', place.title, `Already saved. Added tags: ${tagLabel}`, [
						{ label: 'Undo', handler: () => removeContextTagsFromPlace(place.id, tagIdsToApply) }
					]);
					await loadData();
				} else if (shouldApply && tagsRequested > 0 && tagsApplied === 0) {
					showToast('duplicate', place.title, 'Already saved in this view');
				} else {
					showToast('duplicate', place.title, 'Already saved');
				}
			} else {
				await loadData();

				if (shouldApply && tagsApplied > 0) {
					showToast('success', place.title, `Added to ${tagLabel}`, [
						{ label: 'Undo', handler: () => removeContextTagsFromPlace(place.id, tagIdsToApply) }
					]);
				} else {
					const isVisible = wouldPlaceBeVisibleInCurrentView(place.id);
					if (!isVisible && hasActiveFilters) {
						showToast('info', place.title, "Added, but doesn't match this view", [
							{ label: 'Tag to current view', handler: () => applyContextTagsToPlace(place.id, selectedCustomIds) },
							{ label: 'Clear filters', handler: () => { selectedTagMap = {}; selectedSource = 'all'; } }
						]);
					} else {
						showToast('success', place.title, 'Added!');
					}
				}
			}
			search = '';
		} catch {
			showToast('error', '', 'Network error. Please try again.');
		}
		urlAdding = false;
		searchInputEl?.focus();
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && detectedUrl) {
			e.preventDefault();
			addPlaceFromUrl();
		}
	}

	async function loadData() {
		loading = true;
		try {
			const [placeResult, colResult] = await Promise.all([
				loadPlacesData(supabase),
				loadCollections(supabase).catch((err) => {
					console.warn('[loadData] collections failed:', err);
					return { collections: [] as Collection[], collectionPlacesMap: {} as CollectionMemberMap };
				})
			]);
			places = placeResult.places;
			allTags = placeResult.tags;
			placeTagsMap = buildPlaceTagsMap(allTags, placeResult.placeTags);
			collections = colResult.collections;
			collectionPlacesMap = colResult.collectionPlacesMap;
		} catch (err) {
			console.error('[loadData] failed:', err);
		}
		loading = false;
	}

	async function refreshCollections() {
		const result = await loadCollections(supabase);
		collections = result.collections;
		collectionPlacesMap = result.collectionPlacesMap;
	}

	async function refreshSavedViews() {
		savedViews = await loadSavedViews(supabase);
	}

	function applySavedView(view: SavedView) {
		if (activeSavedViewId === view.id) {
			activeSavedViewId = null;
			selectedTagMap = {};
			selectedSource = 'all';
			return;
		}

		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const tagMap: Record<string, boolean> = {};
		for (const id of f.categoryTagIds ?? []) tagMap[id] = true;
		for (const id of f.areaTagIds ?? []) tagMap[id] = true;
		for (const id of f.customTagIds ?? []) tagMap[id] = true;
		selectedTagMap = tagMap;
		selectedSource = f.source ?? 'all';
		sortBy = (view.sort_by ?? 'newest') as typeof sortBy;
		viewMode = (view.layout_mode ?? 'grid') as typeof viewMode;
		activeSavedViewId = view.id;
	}

	$effect(() => {
		void supabase;
		refreshSavedViews();
	});

	async function refreshTags() {
		const result = await refreshTagsData(supabase);
		allTags = result.tags;
		placeTagsMap = buildPlaceTagsMap(allTags, result.placeTags);
	}

	// Tags actually in use by current places
	let activeTagIds = $derived(new Set(Object.values(placeTagsMap).flat().map((t) => t.id)));

	function sortByOrder(a: Tag, b: Tag): number {
		const oa = a.order_index ?? 0;
		const ob = b.order_index ?? 0;
		if (oa !== ob) return oa - ob;
		return a.name.localeCompare(b.name);
	}

	let categoryTags = $derived(allTags.filter((t) => t.source === 'category' && activeTagIds.has(t.id)).sort(sortByOrder));
	let areaTags = $derived(allTags.filter((t) => t.source === 'area' && activeTagIds.has(t.id)).sort(sortByOrder));
	let userTags = $derived(allTags.filter((t) => t.source === 'user').sort(sortByOrder));
	let selectedTagIds = $derived(Object.keys(selectedTagMap).filter((id) => selectedTagMap[id]));
	let hasActiveFilters = $derived(selectedTagIds.length > 0);

	// Auto-remove selected filters that no longer exist in the dataset
	$effect(() => {
		const validIds = new Set([...categoryTags, ...areaTags, ...userTags].map((t) => t.id));
		const stale = selectedTagIds.filter((id) => !validIds.has(id));
		if (stale.length > 0) {
			const copy = { ...selectedTagMap };
			for (const id of stale) delete copy[id];
			selectedTagMap = copy;
		}
	});

	let sourceLists = $derived([...new Set(places.map((p) => p.source_list).filter((s): s is string => !!s))]);
	let sourceCountMap = $derived(
		sourceLists.reduce<Record<string, number>>((acc, s) => {
			acc[s] = places.filter((p) => p.source_list === s).length;
			return acc;
		}, {})
	);

	// Reset selectedSource when it no longer exists in the dataset
	$effect(() => {
		if (selectedSource !== 'all' && !sourceLists.includes(selectedSource)) {
			selectedSource = 'all';
		}
	});

	let unenrichedCount = $derived(places.filter((p) => !p.enriched_at && p.url).length);

	let selectedCategoryIds = $derived(selectedTagIds.filter((id) => categoryTags.some((t) => t.id === id)));
	let selectedAreaIds = $derived(selectedTagIds.filter((id) => areaTags.some((t) => t.id === id)));
	let selectedCustomIds = $derived(selectedTagIds.filter((id) => userTags.some((t) => t.id === id)));

	// Auto-save the active saved view when user changes filters (debounced)
	let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let autoSaving = false;

	$effect(() => {
		if (!activeSavedViewId || autoSaving) return;
		const view = savedViews.find((v) => v.id === activeSavedViewId);
		if (!view) { activeSavedViewId = null; return; }
		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const catMatch = JSON.stringify([...(f.categoryTagIds ?? [])].sort()) === JSON.stringify([...selectedCategoryIds].sort());
		const areaMatch = JSON.stringify([...(f.areaTagIds ?? [])].sort()) === JSON.stringify([...selectedAreaIds].sort());
		const customMatch = JSON.stringify([...(f.customTagIds ?? [])].sort()) === JSON.stringify([...selectedCustomIds].sort());
		const sourceMatch = (f.source ?? 'all') === selectedSource;
		if (catMatch && areaMatch && customMatch && sourceMatch) return;

		if (autoSaveTimer) clearTimeout(autoSaveTimer);
		const viewId = activeSavedViewId;
		autoSaveTimer = setTimeout(async () => {
			autoSaving = true;
			const filters = buildFiltersSnapshot(selectedCategoryIds, selectedAreaIds, selectedCustomIds, selectedSource);
			await updateSavedView(supabase, viewId, {
				filtersJson: filters,
				sortBy,
				layoutMode: viewMode
			});
			await refreshSavedViews();
			autoSaving = false;
		}, 800);
	});

	let selectedCustomTagNames = $derived(
		selectedCustomIds.map((id) => userTags.find((t) => t.id === id)?.name).filter((n): n is string => !!n)
	);
	let hasCustomContext = $derived(selectedCustomIds.length > 0);

	let scopedPlaces = $derived.by(() => {
		const scope = browseScope;
		if (scope.type === 'collection') {
			const members = collectionPlacesMap[scope.collectionId];
			return members ? places.filter((p) => members.includes(p.id)) : [];
		}
		return places;
	});

	let activeCollectionName = $derived.by(() => {
		const scope = browseScope;
		if (scope.type === 'collection') {
			return collections.find((c) => c.id === scope.collectionId)?.name ?? 'Collection';
		}
		return null;
	});

	let filteredPlaces = $derived(
		scopedPlaces.filter((p) => {
			const pTags = placeTagsMap[p.id] ?? [];
			const pTagIds = pTags.map((t) => t.id);
			const searchLower = search.toLowerCase();

			const matchesSearch =
				search === '' || detectedUrl !== null ||
				p.title.toLowerCase().includes(searchLower) ||
				(p.description ?? '').toLowerCase().includes(searchLower) ||
				(p.address ?? '').toLowerCase().includes(searchLower) ||
				pTags.some((t) => t.name.toLowerCase().includes(searchLower));

			const matchesSource = selectedSource === 'all' || p.source_list === selectedSource;

			// Category: OR — place matches if it has ANY of the selected categories
			const matchesCategory =
				selectedCategoryIds.length === 0 ||
				selectedCategoryIds.some((id) => pTagIds.includes(id));

			// Area: OR — place matches if it's in ANY of the selected areas
			const matchesArea =
				selectedAreaIds.length === 0 ||
				selectedAreaIds.some((id) => pTagIds.includes(id));

			// Custom tags: AND — place must have ALL selected custom tags
			const matchesCustom =
				selectedCustomIds.length === 0 ||
				selectedCustomIds.every((id) => pTagIds.includes(id));

			return matchesSearch && matchesSource && matchesCategory && matchesArea && matchesCustom;
		})
	);

	function getPlaceIdsForView(view: SavedView): string[] {
		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const viewCategoryIds = f.categoryTagIds ?? [];
		const viewAreaIds = f.areaTagIds ?? [];
		const viewCustomIds = f.customTagIds ?? [];
		const viewSource = f.source ?? 'all';

		return scopedPlaces
			.filter((p) => {
				const pTagIds = (placeTagsMap[p.id] ?? []).map((t) => t.id);
				const matchesSource = viewSource === 'all' || p.source_list === viewSource;
				const matchesCategory = viewCategoryIds.length === 0 || viewCategoryIds.some((id: string) => pTagIds.includes(id));
				const matchesArea = viewAreaIds.length === 0 || viewAreaIds.some((id: string) => pTagIds.includes(id));
				const matchesCustom = viewCustomIds.length === 0 || viewCustomIds.every((id: string) => pTagIds.includes(id));
				return matchesSource && matchesCategory && matchesArea && matchesCustom;
			})
			.map((p) => p.id);
	}

	async function createCollectionFromView(view: SavedView) {
		try {
			const ids = getPlaceIdsForView(view);
			if (ids.length === 0) {
				showToast('info', '', 'No places match this view');
				return;
			}
			const userId = session?.user?.id;
			if (!userId) {
				showToast('error', '', 'You must be signed in');
				return;
			}
			const col = await createCollection(supabase, userId, view.name, { placeIds: ids });
			if (col) {
				showToast('success', '', `Collection "${view.name}" created with ${ids.length} places`);
				await refreshCollections();
			} else {
				showToast('error', '', 'Could not create collection');
			}
		} catch (err) {
			console.error('[createCollectionFromView]', err);
			showToast('error', '', 'Failed to create collection');
		}
	}

	let viewPickerPlaceIds = $state<string[]>([]);
	let viewPickerLabel = $state('');
	let showViewCollectionPicker = $state(false);

	function addToCollectionFromView(view: SavedView) {
		const ids = getPlaceIdsForView(view);
		if (ids.length === 0) {
			showToast('info', '', 'No places match this view');
			return;
		}
		viewPickerPlaceIds = ids;
		viewPickerLabel = `${ids.length} places from "${view.name}"`;
		showViewCollectionPicker = true;
	}

	async function handleViewPickerToggle(placeIds: string[], collectionId: string) {
		const existing = collectionPlacesMap[collectionId] ?? [];
		const result = await addPlacesToCollection(supabase, collectionId, placeIds, existing);
		if (result.added > 0) {
			const msg = result.skipped > 0
				? `Added ${result.added} places (${result.skipped} already in collection)`
				: `Added ${result.added} places`;
			showToast('success', '', msg);
		} else {
			showToast('info', '', 'All places already in this collection');
		}
		await refreshCollections();
		showViewCollectionPicker = false;
	}

	let sortedPlaces = $derived(
		[...filteredPlaces].sort((a, b) => {
			switch (sortBy) {
				case 'oldest':
					return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
				case 'az':
					return a.title.localeCompare(b.title);
				case 'za':
					return b.title.localeCompare(a.title);
				case 'rating':
					return (b.rating ?? 0) - (a.rating ?? 0);
				case 'most-tags':
					return (placeTagsMap[b.id]?.length ?? 0) - (placeTagsMap[a.id]?.length ?? 0);
				case 'tag-group': {
					const tagA = (placeTagsMap[a.id] ?? []).find(t => t.source === 'user')?.name ?? '\uffff';
					const tagB = (placeTagsMap[b.id] ?? []).find(t => t.source === 'user')?.name ?? '\uffff';
					return tagA.localeCompare(tagB);
				}
				case 'newest':
				default:
					return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
			}
		})
	);

	function toggleTag(tagId: string) {
		const copy = { ...selectedTagMap };
		if (copy[tagId]) {
			delete copy[tagId];
		} else {
			copy[tagId] = true;
		}
		selectedTagMap = copy;
		sidebarOpen = false;
	}

	async function enrichSingle(placeId: string) {
		enrichingId = placeId;
		try {
			const res = await fetch(`/api/places/${placeId}/enrich`, { method: 'POST' });
			if (res.ok) {
				const { place: enriched } = await res.json();
				places = places.map((p) => (p.id === placeId ? { ...p, ...enriched } : p));
				await refreshTags();
			}
		} finally {
			enrichingId = null;
		}
	}

	async function enrichBatch() {
		enriching = true;
		enrichResult = null;
		try {
			const res = await fetch('/api/places/enrich-all', { method: 'POST' });
			if (res.ok) {
				enrichResult = await res.json();
				await loadData();
			}
		} finally {
			enriching = false;
		}
	}

	function updateNote(placeId: string, note: string) {
		places = places.map((p) => (p.id === placeId ? { ...p, note } : p));
	}

	async function deletePlace(id: string) {
		await supabase.from('places').delete().eq('id', id);
		places = places.filter((p) => p.id !== id);
		const { [id]: _, ...restMap } = placeTagsMap;
		placeTagsMap = restMap;
	}

	async function handleTagReorder(orderedIds: string[]) {
		const prevTags = allTags;
		allTags = allTags.map((t) => {
			const idx = orderedIds.indexOf(t.id);
			return idx >= 0 ? { ...t, order_index: idx } : t;
		});

		const result = await saveTagOrder(supabase, orderedIds);
		if (!result.ok) {
			allTags = prevTags;
			showToast('error', '', 'Could not save tag order. Please try again.');
			return;
		}
		await refreshTags();
	}

	function handleTagContextMenu(tag: Tag, x: number, y: number) {
		contextMenuTag = tag;
		contextMenuPos = { x, y };
	}

	function handleMapPlaceSelect(placeId: string) {
		selectedPlaceId = placeId;
		requestAnimationFrame(() => {
			const el = document.querySelector(`[data-place-id="${placeId}"]`);
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	function handleCardSelect(placeId: string) {
		selectedPlaceId = placeId;
	}

	function openCollectionPicker(placeId: string) {
		collectionPickerPlaceId = collectionPickerPlaceId === placeId ? null : placeId;
	}

	async function togglePlaceInCollection(placeId: string, collectionId: string) {
		const inCol = isPlaceInCollection(collectionPlacesMap, collectionId, placeId);
		if (inCol) {
			collectionPlacesMap = optimisticRemove(collectionPlacesMap, collectionId, placeId);
			await removePlaceFromCollection(supabase, collectionId, placeId);
			showToast('info', '', 'Removed from collection');
		} else {
			collectionPlacesMap = optimisticAdd(collectionPlacesMap, collectionId, placeId);
			await addPlaceToCollection(supabase, collectionId, placeId);
			showToast('success', '', 'Added to collection');
		}
	}

	function closeCollectionPicker() {
		collectionPickerPlaceId = null;
	}

	// Clear selection when filtered places change and the selected place is no longer visible
	$effect(() => {
		if (selectedPlaceId && !filteredPlaces.some(p => p.id === selectedPlaceId)) {
			selectedPlaceId = null;
		}
	});

	// Reset scope if active collection is deleted
	$effect(() => {
		const scope = browseScope;
		if (scope.type === 'collection' && !collections.some(c => c.id === scope.collectionId)) {
			browseScope = { type: 'all' };
		}
	});
</script>

<div class="min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100dvh-3.5rem)]">
	<!-- Sidebar -->
	<TagSidebar
		{supabase}
		userId={session?.user?.id ?? ''}
		{allTags}
		{placeTagsMap}
		totalPlaces={places.length}
		{sourceLists}
		{sourceCountMap}
		{selectedTagMap}
		{selectedSource}
		onTagToggle={toggleTag}
		onSourceSelect={(s) => { selectedSource = s; sidebarOpen = false; }}
		onTagsChanged={refreshTags}
		mobileOpen={sidebarOpen}
		onMobileClose={() => { sidebarOpen = false; }}
		{collections}
		{collectionPlacesMap}
		{browseScope}
		onScopeChange={(scope) => { browseScope = scope; }}
		onCollectionsChanged={refreshCollections}
	/>

	<!-- Split layout: content + map -->
	<div class={isMobile
		? 'flex h-[calc(100dvh-3rem)] flex-col overflow-hidden sm:h-[calc(100dvh-3.5rem)]'
		: 'flex flex-col lg:ml-64 lg:flex-row'}>

		{#if isMobile}
			<MobileMapShell
				places={filteredPlaces}
				{selectedPlaceId}
				onPlaceSelect={handleMapPlaceSelect}
				maptilerKey={data.maptilerKey}
			/>
		{:else}
			<!-- Map panel: top on mobile, sticky right on desktop -->
			<div class="relative z-0 h-[35vh] shrink-0 border-b border-warm-200 sm:h-[38vh] lg:order-2 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:w-[42%] lg:self-start lg:border-b-0 lg:border-l">
				<MapView places={filteredPlaces} {selectedPlaceId} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} />
			</div>
		{/if}

		<!-- Content panel -->
		<div class={isMobile
			? 'flex-1 min-h-0 overflow-y-auto'
			: 'min-w-0 flex-1 lg:order-1'}>
		<div class="mx-auto px-2.5 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-4">
			<!-- Mobile sidebar toggle + search bar -->
			<div class="sticky {isMobile ? 'top-0' : 'top-12'} z-20 -mx-2.5 mb-1 bg-sage-100 px-2.5 py-1.5 sm:static sm:top-14 sm:mx-0 sm:mb-5 sm:bg-transparent sm:px-0 sm:py-0">
				<div class="flex items-center gap-1.5 sm:gap-3">
				<button
					onclick={() => { sidebarOpen = true; }}
					class="rounded-md border border-warm-200 p-1.5 text-warm-500 sm:rounded-lg sm:p-2 lg:hidden"
					aria-label="Open sidebar"
				>
					<svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="3" y1="6" x2="21" y2="6" />
						<line x1="3" y1="12" x2="21" y2="12" />
						<line x1="3" y1="18" x2="21" y2="18" />
					</svg>
				</button>
				<div class="relative flex-1">
					<svg
						class="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400 sm:left-3.5 sm:h-4 sm:w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						bind:this={searchInputEl}
						type="text"
						bind:value={search}
						onkeydown={handleSearchKeydown}
						placeholder="Search or paste a Google Maps link..."
						class="w-full rounded-lg border border-warm-200 bg-warm-50 py-1.5 pl-8 pr-8 text-sm font-medium shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:rounded-xl sm:py-2.5 sm:pl-11 sm:pr-10 sm:text-sm"
					/>
					{#if urlAdding}
						<svg class="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-brand-500 sm:right-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
					{:else if detectedUrl}
						<span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brand-500 sm:right-3.5 sm:text-xs">Press Enter to add</span>
					{/if}
				</div>
				</div>

				<!-- Contextual capture banner -->
				{#if hasCustomContext && (detectedUrl || urlAdding)}
					<div class="mt-1 flex items-center gap-2 rounded-lg border border-brand-200/60 bg-brand-50/80 px-2.5 py-1.5 sm:mt-1.5 sm:px-3 sm:py-2">
						<div class="flex min-w-0 flex-1 items-center gap-1.5">
							<svg class="h-3 w-3 shrink-0 text-brand-500 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
								<line x1="7" y1="7" x2="7.01" y2="7" />
							</svg>
							<span class="truncate text-[10px] font-medium text-brand-700 sm:text-xs">
								Adding into: <span class="font-bold">{selectedCustomTagNames.join(' + ')}</span>
							</span>
						</div>
						<button
							onclick={() => { autoApplyCurrentViewTags = !autoApplyCurrentViewTags; }}
							class="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors sm:text-[11px]
								{autoApplyCurrentViewTags
									? 'bg-brand-500 text-white'
									: 'bg-warm-200 text-warm-500'}"
							aria-label="Toggle auto-apply current view tags"
						>
							{#if autoApplyCurrentViewTags}
								<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</svg>
								Auto-tag ON
							{:else}
								<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
									<path d="M7 11V7a5 5 0 0 1 9.9-1" />
								</svg>
								Auto-tag OFF
							{/if}
						</button>
					</div>
				{/if}
			</div>

			<!-- Saved Views bar -->
			<SavedViewsBar
				{supabase}
				userId={session?.user?.id ?? ''}
				{savedViews}
				{activeSavedViewId}
				{selectedCategoryIds}
				{selectedAreaIds}
				{selectedCustomIds}
				{selectedSource}
				{sortBy}
				{viewMode}
				onApply={applySavedView}
				onViewsChanged={refreshSavedViews}
				onCreateCollection={createCollectionFromView}
				onAddToCollection={addToCollectionFromView}
			/>

			<!-- Reserved filter summary area (always present to prevent layout shift) -->
			<div class="mb-1 flex min-h-[28px] flex-wrap items-center gap-1.5 sm:mb-3 sm:min-h-[32px] sm:gap-2">
				{#if hasActiveFilters || selectedSource !== 'all'}
					<span class="text-[10px] text-warm-400 sm:text-xs">Filtered by:</span>
					{#each selectedTagIds as tagId (tagId)}
						{@const tag = allTags.find((t) => t.id === tagId)}
						{#if tag}
							<button
								onclick={() => toggleTag(tagId)}
								class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white sm:px-2.5 sm:text-xs"
								style="background-color: {tag.color ?? '#6b7280'}"
							>
								{tag.name}
								<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						{/if}
					{/each}
					{#if selectedSource !== 'all'}
						<button
							onclick={() => { selectedSource = 'all'; }}
							class="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2 py-0.5 text-[10px] font-medium text-warm-700 sm:px-2.5 sm:text-xs"
						>
							{selectedSource}
							<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
					<button
						onclick={() => { selectedTagMap = {}; selectedSource = 'all'; }}
						class="text-[10px] text-warm-400 hover:text-warm-600 sm:text-xs"
					>
						Clear
					</button>
				{/if}
			</div>

			<!-- Enrich banner -->
			{#if unenrichedCount > 0}
				<div class="mb-1.5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 sm:mb-4 sm:rounded-xl sm:p-3">
					<span class="text-xs text-amber-700 sm:text-sm">
						{unenrichedCount} missing details
					</span>
					<button
						onclick={enrichBatch}
						disabled={enriching}
						class="rounded-md bg-amber-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
					>
						{enriching ? 'Fetching...' : 'Fetch Details'}
					</button>
				</div>
			{/if}

			{#if enrichResult}
				<div class="mb-1.5 rounded-lg bg-green-50 p-2 text-xs text-green-700 sm:mb-4 sm:rounded-xl sm:p-3 sm:text-sm">
					Fetched details for {enrichResult.enriched} of {enrichResult.total} places.
				</div>
			{/if}

			<!-- ======== MOBILE tag filter (< md) ======== -->
			<div class="mb-1.5 md:hidden">
				<!-- Tab selector: Category | Area | Custom -->
				<div class="mb-1.5 flex items-center rounded-lg border border-warm-200 bg-white p-0.5">
					<button
						onclick={() => { mobileTagTab = 'category'; }}
						class="flex-1 rounded-md px-1 py-1.5 text-center text-[11px] font-bold transition-colors {mobileTagTab === 'category'
							? 'bg-warm-200 text-warm-800'
							: 'text-warm-400'}"
					>
						Category <span class="font-normal opacity-50">{categoryTags.length}</span>
					</button>
					<button
						onclick={() => { mobileTagTab = 'area'; }}
						class="flex-1 rounded-md px-1 py-1.5 text-center text-[11px] font-bold transition-colors {mobileTagTab === 'area'
							? 'bg-sage-200 text-sage-800'
							: 'text-warm-400'}"
					>
						Area <span class="font-normal opacity-50">{areaTags.length}</span>
					</button>
					<button
						onclick={() => { mobileTagTab = 'custom'; }}
						class="flex-1 rounded-md px-1 py-1.5 text-center text-[11px] font-bold transition-colors {mobileTagTab === 'custom'
							? 'bg-brand-100 text-brand-800'
							: 'text-warm-400'}"
					>
						Custom <span class="font-normal opacity-50">{userTags.length}</span>
					</button>
				</div>

			<!-- Tags for the active tab -->
			<div
				class="flex items-center gap-2 overflow-x-auto py-0.5 pr-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
				use:sortable={{
					onReorder: handleTagReorder,
					itemSelector: '[data-tag-id]',
					idAttribute: 'data-tag-id',
					longPressMs: 500,
					disabled: false
				}}
			>
					{#if mobileTagTab === 'category'}
						{#each categoryTags as tag (tag.id)}
							<button data-tag-id={tag.id} onclick={() => toggleTag(tag.id)} class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold transition-all {selectedTagMap[tag.id] ? 'border-brand-400 bg-brand-50 text-warm-800' : 'border-warm-200 text-warm-500'}">{tag.name}</button>
						{/each}
						{#if categoryTags.length === 0}
							<span class="text-xs text-warm-400">No category tags</span>
						{/if}

					{:else if mobileTagTab === 'area'}
						{#each areaTags as tag (tag.id)}
							<button data-tag-id={tag.id} onclick={() => toggleTag(tag.id)} class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold transition-all {selectedTagMap[tag.id] ? 'border-sage-400 bg-sage-50 text-sage-800' : 'border-warm-200 text-warm-500'}">{tag.name}</button>
						{/each}
						{#if areaTags.length === 0}
							<span class="text-xs text-warm-400">No area tags</span>
						{/if}

					{:else if mobileTagTab === 'custom'}
						{#each userTags as tag (tag.id)}
							<button
								data-tag-id={tag.id}
								onclick={() => toggleTag(tag.id)}
								class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-all {selectedTagMap[tag.id] ? 'text-white shadow-sm ring-2 ring-offset-1' : 'text-white opacity-80'}"
								style="background-color: {tag.color ?? '#6b7280'}; {selectedTagMap[tag.id] ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
							>
								{tag.name}
								{#if selectedTagMap[tag.id]}
									<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								{/if}
							</button>
						{/each}
						<button
							onclick={() => { showTagManager = true; }}
							class="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-warm-300 px-2 py-1 text-[10px] text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Manage tags"
						>
							<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Manage
						</button>
						{#if userTags.length === 0}
							<span class="text-xs text-warm-400">No custom tags yet</span>
						{/if}
					{/if}
				</div>
			</div>

			<!-- ======== DESKTOP tag filter (md+) — inline grouped rows ======== -->
			<div class="relative z-10 mb-4 hidden space-y-1.5 md:block">
				{#if categoryTags.length > 0}
					<div class="flex items-baseline gap-2.5">
						<span class="w-16 shrink-0 text-[11px] font-bold text-warm-400">Category</span>
						<div
							class="flex flex-wrap items-center gap-1.5"
							use:sortable={{
								onReorder: handleTagReorder,
								itemSelector: '[data-tag-id]',
								idAttribute: 'data-tag-id',
								longPressMs: 400,
								disabled: false
							}}
						>
							{#each categoryTags as tag (tag.id)}
								<button
									data-tag-id={tag.id}
									onclick={() => toggleTag(tag.id)}
									class="rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all {selectedTagMap[tag.id]
										? 'border-brand-400 bg-brand-50 text-warm-800'
										: 'border-warm-200 text-warm-500 hover:border-warm-300 hover:text-warm-700'}"
								>
									{tag.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				{#if areaTags.length > 0}
					<div class="flex items-baseline gap-2.5">
						<span class="w-16 shrink-0 text-[11px] font-bold text-warm-400">Area</span>
						<div
							class="flex flex-wrap items-center gap-1.5"
							use:sortable={{
								onReorder: handleTagReorder,
								itemSelector: '[data-tag-id]',
								idAttribute: 'data-tag-id',
								longPressMs: 400,
								disabled: false
							}}
						>
							{#each areaTags as tag (tag.id)}
								<button
									data-tag-id={tag.id}
									onclick={() => toggleTag(tag.id)}
									class="rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all {selectedTagMap[tag.id]
										? 'border-sage-400 bg-sage-50 text-sage-800'
										: 'border-warm-200 text-warm-500 hover:border-warm-300 hover:text-warm-700'}"
								>
									{tag.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex items-baseline gap-2.5">
					<span class="w-16 shrink-0 text-[11px] font-bold text-warm-400">Custom</span>
					<div
						class="flex flex-wrap items-center gap-1.5"
						use:sortable={{
							onReorder: handleTagReorder,
							itemSelector: '[data-tag-id]',
							idAttribute: 'data-tag-id',
							longPressMs: 400,
							disabled: false
						}}
					>
						{#each userTags as tag (tag.id)}
							<button
								data-tag-id={tag.id}
								onclick={() => toggleTag(tag.id)}
								class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-all {selectedTagMap[tag.id]
									? 'text-white shadow-sm ring-2 ring-offset-1'
									: 'text-white opacity-80 hover:opacity-100'}"
								style="background-color: {tag.color ?? '#6b7280'}; {selectedTagMap[tag.id] ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
							>
								{tag.name}
								{#if selectedTagMap[tag.id]}
									<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								{/if}
							</button>
						{/each}
						<button
							onclick={() => { showTagManager = true; }}
							class="inline-flex items-center gap-1 rounded-full border border-dashed border-warm-300 px-2 py-0.5 text-[11px] text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Manage tags"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
						</button>
						{#if userTags.length === 0}
							<span class="text-[11px] text-warm-400">No custom tags yet</span>
						{/if}
					</div>
				</div>
			</div>

			<!-- Tag manager modal -->
			{#if showTagManager}
				<TagManager
					{supabase}
					userId={session?.user?.id ?? ''}
					allTags={userTags}
					onClose={() => { showTagManager = false; }}
					onTagsChanged={refreshTags}
				/>
			{/if}

			<!-- Collection scope banner -->
			{#if browseScope.type === 'collection' && activeCollectionName}
				<div class="mb-1.5 flex items-center gap-2 rounded-lg border border-brand-200/60 bg-brand-50/60 px-2.5 py-1.5 sm:mb-3 sm:rounded-xl sm:px-3 sm:py-2">
					<svg class="h-3.5 w-3.5 shrink-0 text-brand-500 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					</svg>
					<span class="flex-1 truncate text-xs font-bold text-brand-700 sm:text-sm">{activeCollectionName}</span>
					<button
						onclick={() => { showAddToCollection = true; }}
						class="shrink-0 rounded-md bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white transition-colors hover:bg-brand-600 sm:text-xs"
					>
						+ Add places
					</button>
					<button
						onclick={() => { browseScope = { type: 'all' }; }}
						class="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold text-brand-500 transition-colors hover:bg-brand-100 sm:text-xs"
					>
						Show all
					</button>
				</div>
			{/if}

			<!-- Results count + sort + view toggle -->
			<div class="mb-1.5 flex items-center justify-between sm:mb-4">
				<p class="text-[11px] font-semibold text-warm-500 sm:text-sm">{filteredPlaces.length} places</p>
				<div class="flex items-center gap-1.5 sm:gap-2">
					<select
						bind:value={sortBy}
						class="rounded-md border border-warm-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-warm-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-[11px]"
					>
						<option value="newest">Recently added</option>
						<option value="oldest">Oldest added</option>
						<option value="az">Name (A–Z)</option>
						<option value="za">Name (Z–A)</option>
						<option value="rating">Rating</option>
						<option value="most-tags">Most tagged</option>
						<option value="tag-group">Tag group</option>
					</select>
				<div class="flex items-center gap-0.5 rounded-md border border-warm-200 bg-white p-0.5 sm:gap-1 sm:rounded-lg">
					<button
						onclick={() => { viewMode = 'grid'; }}
						class="rounded p-1.5 transition-colors sm:rounded-md sm:p-2 {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
						aria-label="Grid view"
					>
						<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7" />
							<rect x="14" y="3" width="7" height="7" />
							<rect x="3" y="14" width="7" height="7" />
							<rect x="14" y="14" width="7" height="7" />
						</svg>
					</button>
					<button
						onclick={() => { viewMode = 'list'; }}
						class="rounded p-1.5 transition-colors sm:rounded-md sm:p-2 {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
						aria-label="List view"
					>
						<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="8" y1="6" x2="21" y2="6" />
							<line x1="8" y1="12" x2="21" y2="12" />
							<line x1="8" y1="18" x2="21" y2="18" />
							<line x1="3" y1="6" x2="3.01" y2="6" />
							<line x1="3" y1="12" x2="3.01" y2="12" />
							<line x1="3" y1="18" x2="3.01" y2="18" />
						</svg>
					</button>
				</div>
				</div>
			</div>

			<!-- Places -->
			{#if loading}
				<div class="flex items-center justify-center py-20">
					<svg class="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
					</svg>
				</div>
			{:else if sortedPlaces.length === 0}
				<div class="py-20 text-center">
					<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<p class="mt-3 text-sm text-warm-500">
						{places.length === 0 ? 'No places yet' : 'No places match your filters'}
					</p>
					{#if places.length === 0}
						<a href="/upload" class="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700">
							Upload some CSV files to get started
						</a>
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
						{enrichingId}
						onEnrich={enrichSingle}
						onDelete={deletePlace}
						onTagClick={toggleTag}
						onTagsChanged={refreshTags}
						onNoteChanged={updateNote}
						onTagContextMenu={handleTagContextMenu}
						selected={selectedPlaceId === place.id}
						onSelect={handleCardSelect}
						{collections}
						{collectionPlacesMap}
						collectionPickerOpen={collectionPickerPlaceId === place.id}
						onCollectionPickerToggle={openCollectionPicker}
						onCollectionPickerClose={closeCollectionPicker}
						onToggleCollection={togglePlaceInCollection}
					/>
				{/each}
			</div>
		{:else}
			<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100 sm:rounded-xl sm:overflow-visible">
				{#each sortedPlaces as place (place.id)}
					<PlaceListItem
						{place}
						placeTags={placeTagsMap[place.id] ?? []}
						{allTags}
						{supabase}
						userId={session?.user?.id ?? ''}
						onTagClick={toggleTag}
						onTagContextMenu={handleTagContextMenu}
						onTagsChanged={refreshTags}
						onNoteChanged={updateNote}
						onDelete={deletePlace}
						selected={selectedPlaceId === place.id}
						onSelect={handleCardSelect}
						{collections}
						{collectionPlacesMap}
						onToggleCollection={togglePlaceInCollection}
					/>
				{/each}
			</div>
		{/if}
	</div>
	</div>
</div>


	<!-- Add existing places to collection modal -->
	{#if showAddToCollection && browseScope.type === 'collection'}
		{@const scopeId = browseScope.collectionId}
		{@const members = collectionPlacesMap[scopeId] ?? []}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onclick={() => { showAddToCollection = false; }}>
			<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
			<div
				class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
				onclick={(e) => e.stopPropagation()}
			>
				<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
					<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {activeCollectionName}</h2>
					<button onclick={() => { showAddToCollection = false; }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div class="flex-1 overflow-y-auto px-2 py-2 sm:px-3">
					{#each places.filter(p => !members.includes(p.id)) as p (p.id)}
						<button
							onclick={async () => { await togglePlaceInCollection(p.id, scopeId); }}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50"
						>
							<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-warm-800">{p.title}</p>
								<p class="truncate text-[11px] text-warm-400">{p.area ? `${p.area} · ` : ''}{p.category ?? ''}</p>
							</div>
							{#if p.rating}
								<span class="shrink-0 text-xs font-bold text-warm-500"><span class="text-brand-500">★</span> {p.rating.toFixed(1)}</span>
							{/if}
						</button>
					{:else}
						<p class="py-8 text-center text-sm text-warm-400">All places are already in this collection.</p>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	{#if contextMenuTag}
		<TagContextMenu
			tag={contextMenuTag}
			x={contextMenuPos.x}
			y={contextMenuPos.y}
			{supabase}
			allTags={userTags}
			onClose={() => { contextMenuTag = null; }}
			onTagsChanged={refreshTags}
		/>
	{/if}

	<!-- Collection picker for "Add to Collection" from saved view -->
	{#if showViewCollectionPicker}
		<AddToCollectionModal
			placeIds={viewPickerPlaceIds}
			label={viewPickerLabel}
			{collections}
			{collectionPlacesMap}
			onToggle={handleViewPickerToggle}
			onClose={() => { showViewCollectionPicker = false; }}
		/>
	{/if}

	<!-- Lightweight toasts for URL add feedback -->
	{#if toasts.length > 0}
		<div class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8">
			{#each toasts as toast (toast.id)}
				<div
					class="flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in
						{toast.type === 'success' ? 'border border-sage-200/60 bg-sage-50/95 text-sage-800' : ''}
						{toast.type === 'duplicate' ? 'border border-amber-200/60 bg-amber-50/95 text-amber-800' : ''}
						{toast.type === 'error' ? 'border border-red-200/60 bg-red-50/95 text-red-700' : ''}
						{toast.type === 'info' ? 'border border-blue-200/60 bg-blue-50/95 text-blue-800' : ''}"
				>
					{#if toast.type === 'success'}
						<svg class="h-4 w-4 shrink-0 text-sage-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
							<polyline points="22 4 12 14.01 9 11.01" />
						</svg>
					{:else if toast.type === 'duplicate'}
						<svg class="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					{:else if toast.type === 'info'}
						<svg class="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="16" x2="12" y2="12" />
							<line x1="12" y1="8" x2="12.01" y2="8" />
						</svg>
					{:else}
						<svg class="h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="15" y1="9" x2="9" y2="15" />
							<line x1="9" y1="9" x2="15" y2="15" />
						</svg>
					{/if}
					<div class="flex items-center gap-2">
						{#if toast.title}
							<span class="max-w-[200px] truncate text-xs font-bold sm:max-w-[280px] sm:text-sm">{toast.title}</span>
							<span class="text-[10px] font-medium opacity-70 sm:text-xs">{toast.message}</span>
						{:else}
							<span class="text-xs font-medium sm:text-sm">{toast.message}</span>
						{/if}
						{#if toast.actions}
							<span class="mx-0.5 text-warm-300">|</span>
							{#each toast.actions as action}
								<button
									onclick={() => { action.handler(); dismissToast(toast.id); }}
									class="text-[10px] font-bold underline decoration-current/40 underline-offset-2 transition-colors hover:opacity-80 sm:text-xs"
								>
									{action.label}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
