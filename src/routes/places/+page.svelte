<script lang="ts">
	import type { Place, Tag, Collection, BrowseScope, SavedView, SavedViewFilters, TagGroup } from '$lib/types/database';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import TagManager from '$lib/components/TagManager.svelte';
	import TagContextMenu from '$lib/components/TagContextMenu.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import MobileMapShell from '$lib/components/MobileMapShell.svelte';
	import SavedViewsBar from '$lib/components/SavedViewsBar.svelte';
	import SaveViewButton from '$lib/components/SaveViewButton.svelte';
	import AddToCollectionModal from '$lib/components/AddToCollectionModal.svelte';
	import PhotoGrid from '$lib/components/PhotoGrid.svelte';
	import PhotoLightbox from '$lib/components/PhotoLightbox.svelte';
	import { sortable } from '$lib/actions/sortable';
	import { saveTagOrder } from '$lib/tag-order';
	import { textColorForBg } from '$lib/tag-colors';
	import { getToasts, showToast, dismissToast } from '$lib/stores/toasts.svelte';
	import { loadPlacesData, refreshTagsData, buildPlaceTagsMap, removeTagsFromPlace, applyTagsToPlace } from '$lib/stores/places.svelte';
	import { loadCollections, addPlaceToCollection, addPlacesToCollection, removePlaceFromCollection, isPlaceInCollection, optimisticAdd, optimisticRemove, createCollection } from '$lib/stores/collections.svelte';
	import { loadSavedViews, updateSavedView, buildFiltersSnapshot, reorderSavedViews } from '$lib/stores/saved-views.svelte';
	import { isUrlTimingEnabled, logTimingObject } from '$lib/url-timing';
	import { loadPlacePhotos } from '$lib/photo-storage';
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
				photos: (d.placePhotos ?? {}) as Record<string, string[]>,
				loaded: true
			};
		}
		return { places: [] as Place[], tags: [] as Tag[], ptMap: {} as Record<string, Tag[]>, colls: [] as Collection[], cpm: {} as CollectionMemberMap, photos: {} as Record<string, string[]>, loaded: false };
	}

	const serverData = initFromServer();
	let places = $state<Place[]>(serverData.places);
	let allTags = $state<Tag[]>(serverData.tags);
	let placeTagsMap = $state<Record<string, Tag[]>>(serverData.ptMap);
	let loading = $state(!serverData.loaded);
	let search = $state('');
	let selectedTagMap = $state<Record<string, boolean>>({});
	let filterMode = $state<'all' | 'any'>('all');
	let selectedSource = $state('all');
	let enriching = $state(false);
	let enrichingId = $state<string | null>(null);
	let enrichResult = $state<{ enriched: number; total: number } | null>(null);
	let showTagManager = $state(false);
	
	let viewMode = $state<'grid' | 'list'>('grid');
	let sortBy = $state<'newest' | 'oldest' | 'az' | 'za' | 'rating' | 'most-tags' | 'tag-group'>('newest');
	let contextMenuTag = $state<Tag | null>(null);
	let contextMenuPos = $state({ x: 0, y: 0 });

	let selectedPlaceId = $state<string | null>(null);
	let recenterTick = $state(0);

	let collections = $state<Collection[]>(serverData.colls);
	let collectionPlacesMap = $state<CollectionMemberMap>(serverData.cpm);
	let browseScope = $state<BrowseScope>({ type: 'all' });
	let collectionPickerPlaceId = $state<string | null>(null);
	let showAddToCollection = $state(false);

	let urlAdding = $state(false);
	let toasts = $derived(getToasts());
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let mobileOptionsOpen = $state(false);
	let photoModalPlaceId = $state<string | null>(null);
	let placePhotos = $state<Record<string, string[]>>({ ...serverData.photos });
	let popupLightbox = $state<{ placeId: string; startIndex: number } | null>(null);

	const DESKTOP_MAP_DEFAULT_PCT = 42;
	const DESKTOP_MAP_MIN_PCT = 25;
	const DESKTOP_MAP_MAX_PCT = 75;
	let desktopMapPct = $state(DESKTOP_MAP_DEFAULT_PCT);
	let desktopMapDragging = $state(false);
	let desktopMapAnimating = $state(false);
	let desktopDragStartX = 0;
	let desktopDragStartPct = 0;

	function onDesktopHandleDown(e: PointerEvent) {
		if (desktopMapAnimating) return;
		desktopMapDragging = true;
		desktopDragStartX = e.clientX;
		desktopDragStartPct = desktopMapPct;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDesktopHandleMove(e: PointerEvent) {
		if (!desktopMapDragging) return;
		const deltaX = desktopDragStartX - e.clientX;
		const deltaPct = (deltaX / window.innerWidth) * 100;
		desktopMapPct = Math.max(DESKTOP_MAP_MIN_PCT, Math.min(DESKTOP_MAP_MAX_PCT, desktopDragStartPct + deltaPct));
	}

	function onDesktopHandleUp() {
		if (!desktopMapDragging) return;
		desktopMapDragging = false;
	}

	function onDesktopHandleDblClick() {
		desktopMapAnimating = true;
		desktopMapPct = DESKTOP_MAP_DEFAULT_PCT;
		setTimeout(() => { desktopMapAnimating = false; }, 250);
	}

	let autoApplyCurrentViewTags = $state(true);

	let savedViews = $state<SavedView[]>([]);
	let activeSavedViewId = $state<string | null>(null);
	let appliedSnapshot = $state<{ tagMapKey: string; source: string; searchText: string } | null>(null);
	let suppressDeactivate = $state(false);

	let isMobile = $state(false);
	let vvHeight = $state(0);

	$effect(() => {
		function checkMobile() {
			isMobile = window.innerWidth < 1024;
		}
		checkMobile();
		window.addEventListener('resize', checkMobile);

		vvHeight = window.visualViewport?.height ?? window.innerHeight;
		function onVVResize() {
			vvHeight = window.visualViewport?.height ?? window.innerHeight;
		}
		window.visualViewport?.addEventListener('resize', onVVResize);

		function handleExternalPlaceAdded() {
			loadData();
		}
		window.addEventListener('place-added', handleExternalPlaceAdded);

		return () => {
			window.removeEventListener('resize', checkMobile);
			window.visualViewport?.removeEventListener('resize', onVVResize);
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
		await refreshTags();
		showToast('info', '', 'Tags removed');
	}

	async function applyContextTagsToPlace(placeId: string, tagIds: string[]) {
		await applyTagsToPlace(supabase, placeId, tagIds);
		await refreshTags();
		showToast('success', '', 'Tagged to current view');
	}

	function wouldPlaceBeVisibleInCurrentView(placeId: string): boolean {
		const pTags = placeTagsMap[placeId] ?? [];
		const pTagIds = pTags.map((t) => t.id);
		const matchesCustom =
			selectedCustomIds.length === 0 ||
			(filterMode === 'any'
				? selectedCustomIds.some((id) => pTagIds.includes(id))
				: selectedCustomIds.every((id) => pTagIds.includes(id)));
		const matchesSource = selectedSource === 'all';
		return matchesCustom && matchesSource;
	}

	async function addPlaceFromUrl() {
		if (!detectedUrl || urlAdding) return;
		const url = search.trim();
		const shouldApply = autoApplyCurrentViewTags && hasCustomContext;
		const tagIdsToApply = shouldApply ? [...selectedCustomIds] : [];
		const tagNamesToApply = shouldApply ? [...selectedCustomTagNames] : [];
		const tagLabel = tagNamesToApply.join(' + ');

		const debug = isUrlTimingEnabled();
		const t0 = performance.now();

		console.log('[addPlace] submitting url:', url, '| contextTags:', tagIdsToApply.length, '| autoApply:', shouldApply);
		urlAdding = true;
		try {
			const tFetch0 = performance.now();
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
			const tFetch1 = performance.now();
			const result = await res.json();
			const tParse = performance.now();
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

			const tRender0 = performance.now();

			if (result.duplicate) {
				if (shouldApply && tagsApplied > 0) {
					showToast('success', place.title, `Already saved. Added tags: ${tagLabel}`, [
						{ label: 'Undo', handler: () => removeContextTagsFromPlace(place.id, tagIdsToApply) }
					]);
					await refreshTags();
				} else if (shouldApply && tagsRequested > 0 && tagsApplied === 0) {
					showToast('duplicate', place.title, 'Already saved in this view');
				} else {
					showToast('duplicate', place.title, 'Already saved');
				}
			} else {
				if (!places.some((p) => p.id === place.id)) {
					places = [place, ...places];
				}
				if (shouldApply && tagsApplied > 0) {
					await refreshTags();
				}

				if (shouldApply && tagsApplied > 0) {
					showToast('success', place.title, `Added to ${tagLabel}`, [
						{ label: 'Undo', handler: () => removeContextTagsFromPlace(place.id, tagIdsToApply) }
					]);
				} else {
					const isVisible = wouldPlaceBeVisibleInCurrentView(place.id);
					if (!isVisible && hasActiveFilters) {
						showToast('info', place.title, "Added, but doesn't match this view", [
							{ label: 'Tag to current view', handler: () => applyContextTagsToPlace(place.id, selectedCustomIds) },
							{ label: 'Clear filters', handler: () => { clearAllFilters(); } }
						]);
					} else {
						showToast('success', place.title, 'Added!');
					}
				}
			}
			search = '';

			if (debug) {
				const tRender1 = performance.now();
				const round = (n: number) => Math.round(n * 100) / 100;
				const clientTiming: Record<string, number> = {
					'frontend prep (submit → fetch)': round(tFetch0 - t0),
					'network round-trip (fetch → response)': round(tFetch1 - tFetch0),
					'response parse (JSON)': round(tParse - tFetch1),
					'frontend render + state update': round(tRender1 - tRender0),
					'total client-side': round(tRender1 - t0),
				};
				if (result.__timing) {
					clientTiming['--- SERVER BREAKDOWN ---'] = 0;
					for (const [k, v] of Object.entries(result.__timing as Record<string, number>)) {
						clientTiming[`  server: ${k}`] = v;
					}
				}
				logTimingObject('addPlace', clientTiming);
			}
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
		const userId = session?.user?.id;
		try {
			const [placeResult, colResult] = await Promise.all([
				loadPlacesData(supabase, userId),
				loadCollections(supabase, userId).catch((err) => {
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
		const result = await loadCollections(supabase, session?.user?.id);
		collections = result.collections;
		collectionPlacesMap = result.collectionPlacesMap;
	}

	async function refreshSavedViews() {
		savedViews = await loadSavedViews(supabase, session?.user?.id);
	}

	async function handleSavedViewReorder(orderedIds: string[]) {
		const prev = savedViews;
		savedViews = orderedIds
			.map((id, i) => {
				const v = prev.find((sv) => sv.id === id);
				return v ? { ...v, order_index: i } : null;
			})
			.filter((v): v is SavedView => v !== null);

		const ok = await reorderSavedViews(supabase, orderedIds);
		if (!ok) {
			savedViews = prev;
			showToast('error', '', 'Could not save view order');
		}
	}

	function applySavedView(view: SavedView) {
		if (activeSavedViewId === view.id) {
			activeSavedViewId = null;
			appliedSnapshot = null;
			selectedTagMap = {};
			filterMode = 'all';
			selectedSource = 'all';
			search = '';
			return;
		}

		suppressDeactivate = true;
		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const tagMap: Record<string, boolean> = {};
		let mode: 'all' | 'any' = 'all';
		if (f.tagGroups && f.tagGroups.length > 0) {
			for (const id of f.tagGroups[0].tagIds) tagMap[id] = true;
			mode = f.tagGroups[0].mode;
		} else if (f.customTagIds && f.customTagIds.length > 0) {
			for (const id of f.customTagIds) tagMap[id] = true;
		}
		selectedTagMap = tagMap;
		filterMode = mode;
		selectedSource = f.source ?? 'all';
		search = f.searchText ?? '';
		sortBy = (view.sort_by ?? 'newest') as typeof sortBy;
		viewMode = (view.layout_mode ?? 'grid') as typeof viewMode;
		activeSavedViewId = view.id;
		appliedSnapshot = {
			tagMapKey: JSON.stringify(Object.keys(tagMap).sort()),
			source: f.source ?? 'all',
			searchText: f.searchText ?? ''
		};
		requestAnimationFrame(() => { suppressDeactivate = false; });
	}

	async function quickUpdateView() {
		if (!activeSavedViewId) return;
		const tg: TagGroup[] = selectedCustomIds.length > 0
			? [{ id: '0', tagIds: [...selectedCustomIds], mode: filterMode }]
			: [];
		const searchText = (!detectedUrl && search.trim()) ? search.trim() : undefined;
		const filters = buildFiltersSnapshot(selectedCustomIds, selectedSource, tg, searchText);
		const ok = await updateSavedView(supabase, activeSavedViewId, {
			filtersJson: filters,
			sortBy,
			layoutMode: viewMode
		});
		if (ok) {
			const viewName = savedViews.find((v) => v.id === activeSavedViewId)?.name ?? 'View';
			showToast('success', '', `"${viewName}" updated`);
			await refreshSavedViews();
			appliedSnapshot = {
				tagMapKey: JSON.stringify([...selectedCustomIds].sort()),
				source: selectedSource,
				searchText: searchText ?? ''
			};
		} else {
			showToast('error', '', 'Could not update view');
		}
	}

	function discardViewChanges() {
		const view = savedViews.find((v) => v.id === activeSavedViewId);
		if (!view) {
			activeSavedViewId = null;
			appliedSnapshot = null;
			return;
		}
		suppressDeactivate = true;
		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const tagMap: Record<string, boolean> = {};
		let mode: 'all' | 'any' = 'all';
		if (f.tagGroups && f.tagGroups.length > 0) {
			for (const id of f.tagGroups[0].tagIds) tagMap[id] = true;
			mode = f.tagGroups[0].mode;
		} else if (f.customTagIds && f.customTagIds.length > 0) {
			for (const id of f.customTagIds) tagMap[id] = true;
		}
		selectedTagMap = tagMap;
		filterMode = mode;
		selectedSource = f.source ?? 'all';
		search = f.searchText ?? '';
		sortBy = (view.sort_by ?? 'newest') as typeof sortBy;
		viewMode = (view.layout_mode ?? 'grid') as typeof viewMode;
		appliedSnapshot = {
			tagMapKey: JSON.stringify(Object.keys(tagMap).sort()),
			source: f.source ?? 'all',
			searchText: f.searchText ?? ''
		};
		requestAnimationFrame(() => { suppressDeactivate = false; });
	}

	let savedViewsLoaded = false;
	$effect(() => {
		void supabase;
		if (!savedViewsLoaded) {
			savedViewsLoaded = true;
			refreshSavedViews();
		}
	});

	async function refreshTags(optimistic?: { newTags: Tag[]; placeId: string; tagIds: string[] }) {
		if (optimistic) {
			const existingIds = new Set(allTags.map((t) => t.id));
			const added = optimistic.newTags.filter((t) => !existingIds.has(t.id));
			if (added.length > 0) allTags = [...allTags, ...added];
			const current = placeTagsMap[optimistic.placeId] ?? [];
			const currentIds = new Set(current.map((t) => t.id));
			const newLinks = optimistic.newTags.filter((t) => !currentIds.has(t.id));
			if (newLinks.length > 0) {
				placeTagsMap = { ...placeTagsMap, [optimistic.placeId]: [...current, ...newLinks] };
			}
			return;
		}
		const userId = session?.user?.id;
		const result = await refreshTagsData(supabase, userId);
		allTags = result.tags;
		placeTagsMap = buildPlaceTagsMap(allTags, result.placeTags);
	}

	function sortByOrder(a: Tag, b: Tag): number {
		const oa = a.order_index ?? 0;
		const ob = b.order_index ?? 0;
		if (oa !== ob) return oa - ob;
		return a.name.localeCompare(b.name);
	}

	let userTags = $derived(allTags.filter((t) => t.source === 'user').sort(sortByOrder));
	let selectedTagIds = $derived(Object.keys(selectedTagMap).filter((id) => selectedTagMap[id]));
	let activeSearchTerms = $derived(
		(!detectedUrl && search.trim()) ? search.split(',').map(t => t.trim()).filter(Boolean) : []
	);
	let hasActiveFilters = $derived(selectedTagIds.length > 0 || activeSearchTerms.length > 0);

	// Auto-remove selected filters that no longer exist in the dataset
	$effect(() => {
		const validIds = new Set(userTags.map((t) => t.id));
		const stale = selectedTagIds.filter((id) => !validIds.has(id));
		if (stale.length > 0) {
			const copy = { ...selectedTagMap };
			for (const id of stale) delete copy[id];
			selectedTagMap = copy;
		}
	});

	let sourceLists = $derived([...new Set(places.map((p) => p.source_list).filter((s): s is string => !!s))]);

	// Reset selectedSource when it no longer exists in the dataset
	$effect(() => {
		if (selectedSource !== 'all' && !sourceLists.includes(selectedSource)) {
			selectedSource = 'all';
		}
	});

	let unenrichedCount = $derived(places.filter((p) => !p.enriched_at && p.url).length);

	let selectedCustomIds = $derived(selectedTagIds.filter((id) => userTags.some((t) => t.id === id)));

	let viewIsDirty = $derived.by(() => {
		if (!activeSavedViewId || !appliedSnapshot) return false;
		const currentTagKey = JSON.stringify([...selectedCustomIds].sort());
		return (
			currentTagKey !== appliedSnapshot.tagMapKey ||
			selectedSource !== appliedSnapshot.source ||
			search !== (appliedSnapshot.searchText ?? '')
		);
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

			const matchesSearch = (() => {
				if (search === '' || detectedUrl !== null) return true;
				const terms = search.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
				if (terms.length === 0) return true;
				const haystack = [
					p.title,
					p.description ?? '',
					p.address ?? '',
					p.category ?? '',
					p.area ?? '',
					...pTags.map((t) => t.name)
				].join(' ').toLowerCase();
				return terms.every((term) => haystack.includes(term));
			})();

			const matchesSource = selectedSource === 'all' || p.source_list === selectedSource;

			const matchesCustom =
				selectedCustomIds.length === 0 ||
				(filterMode === 'any'
					? selectedCustomIds.some((id) => pTagIds.includes(id))
					: selectedCustomIds.every((id) => pTagIds.includes(id)));

			return matchesSearch && matchesSource && matchesCustom;
		})
	);

	function getPlaceIdsForView(view: SavedView): string[] {
		const f = (view.filters_json ?? {}) as SavedViewFilters;
		const viewSource = f.source ?? 'all';
		let viewGroups: TagGroup[];
		if (f.tagGroups && f.tagGroups.length > 0) {
			viewGroups = f.tagGroups;
		} else if (f.customTagIds && f.customTagIds.length > 0) {
			viewGroups = [{ id: '0', tagIds: f.customTagIds, mode: 'all' }];
		} else {
			viewGroups = [];
		}
		const active = viewGroups.filter((g) => g.tagIds.length > 0);

		return scopedPlaces
			.filter((p) => {
				const pTagIds = (placeTagsMap[p.id] ?? []).map((t) => t.id);
				const matchesSource = viewSource === 'all' || p.source_list === viewSource;
				const matchesCustom = active.length === 0 || active.every((group) => {
					if (group.tagIds.length === 0) return true;
					return group.mode === 'any'
						? group.tagIds.some((id: string) => pTagIds.includes(id))
						: group.tagIds.every((id: string) => pTagIds.includes(id));
				});
				return matchesSource && matchesCustom;
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

	let createdAtTs = $derived(
		Object.fromEntries(places.map((p) => [p.id, new Date(p.created_at).getTime()]))
	);

	let sortedPlaces = $derived(
		[...filteredPlaces].sort((a, b) => {
			switch (sortBy) {
				case 'oldest':
					return (createdAtTs[a.id] ?? 0) - (createdAtTs[b.id] ?? 0);
				case 'az':
					return a.title.localeCompare(b.title);
				case 'za':
					return b.title.localeCompare(a.title);
			case 'rating':
				return (b.user_rating ?? 0) - (a.user_rating ?? 0);
				case 'most-tags':
					return (placeTagsMap[b.id]?.length ?? 0) - (placeTagsMap[a.id]?.length ?? 0);
				case 'tag-group': {
					const tagA = (placeTagsMap[a.id] ?? []).find(t => t.source === 'user')?.name ?? '\uffff';
					const tagB = (placeTagsMap[b.id] ?? []).find(t => t.source === 'user')?.name ?? '\uffff';
					return tagA.localeCompare(tagB);
				}
				case 'newest':
				default:
					return (createdAtTs[b.id] ?? 0) - (createdAtTs[a.id] ?? 0);
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
	}

	function toggleFilterMode() {
		filterMode = filterMode === 'all' ? 'any' : 'all';
	}

	function clearAllFilters() {
		selectedTagMap = {};
		filterMode = 'all';
		selectedSource = 'all';
		search = '';
		if (activeSavedViewId) {
			activeSavedViewId = null;
			appliedSnapshot = null;
		}
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

	function updateRating(placeId: string, rating: number | null) {
		places = places.map((p) =>
			p.id === placeId
				? { ...p, user_rating: rating, user_rated_at: rating != null ? new Date().toISOString() : null }
				: p
		);
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
			requestAnimationFrame(() => {
				scrollToPlace(placeId);
			});
		});
	}

	function scrollToPlace(placeId: string) {
		const els = document.querySelectorAll(`[data-place-id="${placeId}"]`);
		for (const el of els) {
			if (!(el instanceof HTMLElement)) continue;
			if (el.closest('.map-wrapper')) continue;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) continue;

			const scrollParent = findScrollParent(el);
			if (scrollParent && scrollParent !== document.documentElement) {
				const parentRect = scrollParent.getBoundingClientRect();
				const elTopInContainer = rect.top - parentRect.top + scrollParent.scrollTop;
				const centeredScroll = elTopInContainer - parentRect.height / 2 + rect.height / 2;
				scrollParent.scrollTo({ top: centeredScroll, behavior: 'smooth' });
			} else {
				const scrollY = window.scrollY;
				const elTopAbsolute = rect.top + scrollY;
				const centeredScroll = elTopAbsolute - window.innerHeight / 2 + rect.height / 2;
				window.scrollTo({ top: centeredScroll, behavior: 'smooth' });
			}
			break;
		}
	}

	function findScrollParent(el: HTMLElement): HTMLElement | null {
		let node: HTMLElement | null = el.parentElement;
		while (node) {
			const overflow = getComputedStyle(node).overflowY;
			if (overflow === 'auto' || overflow === 'scroll') return node;
			node = node.parentElement;
		}
		return null;
	}

	function handlePopupPhotoAction(placeId: string) {
		photoModalPlaceId = placeId;
	}

	function handlePopupPhotoClick(placeId: string, photoIndex: number) {
		popupLightbox = { placeId, startIndex: photoIndex };
	}

	async function closePhotoModal() {
		const closingPlaceId = photoModalPlaceId;
		photoModalPlaceId = null;
		if (!closingPlaceId) return;
		try {
			const results = await loadPlacePhotos(supabase, closingPlaceId);
			const urls = results.map(r => r.publicUrl);
			placePhotos = { ...placePhotos, [closingPlaceId]: urls };
		} catch (e) {
			console.log('[closePhotoModal] failed to refresh photos', e);
		}
	}

	function handleCardSelect(placeId: string) {
		const scrollY = window.scrollY;
		selectedPlaceId = placeId;
		recenterTick++;
		requestAnimationFrame(() => {
			if (window.scrollY !== scrollY) {
				window.scrollTo({ top: scrollY, behavior: 'instant' });
			}
		});
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

{#snippet placesSearchBlock()}
{/snippet}

{#snippet placesSearchOverlay()}
{/snippet}

{#snippet placesContextualBlock()}
				<!-- Contextual capture banner (sticky when URL detected) -->
				{#if hasCustomContext && (detectedUrl || urlAdding)}
				<div class="sticky top-0 z-20 -mx-2.5 mb-1 bg-sage-100 px-2.5 py-1.5 max-lg:relative max-lg:top-auto max-lg:z-10 max-lg:mx-0 max-lg:mb-2 max-lg:bg-transparent max-lg:px-0 sm:static sm:mx-0 sm:mb-2 sm:bg-transparent sm:px-0 sm:py-0">
						<div class="flex items-center gap-2 rounded-lg border border-brand-200/60 bg-brand-50/80 px-2.5 py-1.5 sm:px-3 sm:py-2">
							<div class="flex min-w-0 flex-1 items-center gap-1.5">
								<svg class="h-3 w-3 shrink-0 text-brand-500 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
									<line x1="7" y1="7" x2="7.01" y2="7" />
								</svg>
								<span class="truncate text-xs font-medium text-brand-700">
									Adding into: <span class="font-bold">{selectedCustomTagNames.join(' + ')}</span>
								</span>
							</div>
							<button
								onclick={() => { autoApplyCurrentViewTags = !autoApplyCurrentViewTags; }}
								class="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold transition-colors
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
				</div>
				{/if}
{/snippet}

{#snippet placesSavedViewsBlock()}
				<!-- Saved Views bar -->
				<SavedViewsBar
					{supabase}
					userId={session?.user?.id ?? ''}
					{savedViews}
					{activeSavedViewId}
					{viewIsDirty}
					onApply={applySavedView}
					onViewsChanged={refreshSavedViews}
					onQuickUpdate={quickUpdateView}
					onCreateCollection={createCollectionFromView}
					onAddToCollection={addToCollectionFromView}
					onReorder={handleSavedViewReorder}
				/>
{/snippet}

{#snippet placesControlsBlock()}
				<!-- Reserved filter summary area (always present to prevent layout shift) -->
				<div class="mb-1.5 min-h-[28px] sm:mb-1.5 sm:min-h-[32px]">
					{#if hasActiveFilters || selectedSource !== 'all' || (activeSavedViewId && viewIsDirty)}
						{@const showChipsRow = hasActiveFilters || selectedSource !== 'all'}
						{@const isEditingSavedView = !!(activeSavedViewId && viewIsDirty)}
						<div
							class="flex flex-col gap-1 sm:gap-1.5 {isEditingSavedView
								? 'rounded-lg border border-brand-200/50 bg-brand-50/70 px-2 py-1.5 sm:px-2.5 sm:py-2'
								: ''}"
						>
							{#if showChipsRow}
								<div class="flex min-w-0 items-center gap-2 lg:items-baseline lg:gap-2.5">
									<span class="hidden shrink-0 text-sm font-bold text-warm-400 lg:inline" style="width: 3rem">Filters</span>
									<div
										class="-mx-0.5 flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-x-visible [&::-webkit-scrollbar]:hidden"
									>
										{#if isEditingSavedView}
											<span
												class="mr-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold leading-tight text-brand-600 sm:mr-1 sm:text-xs"
											>
												Editing<span class="hidden sm:inline">{' view'}</span>
											</span>
										{/if}
										<span class="shrink-0 text-xs font-bold text-warm-400 sm:text-sm lg:hidden">Filters</span>
										{#if activeSearchTerms.length > 0}
											{#each activeSearchTerms as term, i (i)}
												<button
													onclick={() => {
														const remaining = activeSearchTerms.filter((_, idx) => idx !== i);
														search = remaining.join(', ');
													}}
													class="inline-flex shrink-0 items-center gap-1 rounded-full border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-100 sm:px-2.5 sm:text-sm"
												>
													<svg class="h-2.5 w-2.5 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
														<circle cx="11" cy="11" r="8" />
														<line x1="21" y1="21" x2="16.65" y2="16.65" />
													</svg>
													{term}
													<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
														<line x1="18" y1="6" x2="6" y2="18" />
														<line x1="6" y1="6" x2="18" y2="18" />
													</svg>
												</button>
											{/each}
										{/if}
										{#if selectedCustomIds.length >= 2}
											<div class="inline-flex shrink-0 overflow-hidden rounded-full border border-warm-200 text-xs font-bold">
												<button
													onclick={() => { filterMode = 'all'; }}
													class="px-2 py-0.5 transition-colors {filterMode === 'all'
														? 'bg-warm-700 text-white'
														: 'bg-white text-warm-400 hover:bg-warm-50 hover:text-warm-600'}"
												>and</button>
												<button
													onclick={() => { filterMode = 'any'; }}
													class="px-2 py-0.5 transition-colors {filterMode === 'any'
														? 'bg-warm-700 text-white'
														: 'bg-white text-warm-400 hover:bg-warm-50 hover:text-warm-600'}"
												>or</button>
											</div>
										{/if}
										{#each selectedCustomIds as tagId (tagId)}
											{@const tag = allTags.find((t) => t.id === tagId)}
											{#if tag}
												<button
													onclick={() => toggleTag(tagId)}
													class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:px-2.5 sm:text-sm"
													style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}"
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
												class="inline-flex shrink-0 items-center gap-1 rounded-full bg-warm-200 px-2 py-0.5 text-xs font-medium text-warm-700 sm:px-2.5 sm:text-sm"
											>
												{selectedSource}
												<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
													<line x1="18" y1="6" x2="6" y2="18" />
													<line x1="6" y1="6" x2="18" y2="18" />
												</svg>
											</button>
										{/if}
									</div>
									<div
										class="flex shrink-0 items-center py-0.5 {isEditingSavedView
											? 'gap-2 pl-2 sm:gap-2.5 sm:pl-2.5'
											: 'gap-1.5 border-l border-warm-200/70 pl-2 sm:gap-2 sm:pl-2.5'}"
									>
										{#if isEditingSavedView}
											<div class="flex items-center gap-2 sm:gap-2.5" role="group" aria-label="Save or cancel view edits">
												<button
													type="button"
													onclick={discardViewChanges}
													class="whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold text-warm-500 transition-colors hover:bg-warm-100/80 hover:text-warm-800 sm:text-sm"
												>
													Cancel
												</button>
												<button
													type="button"
													onclick={quickUpdateView}
													class="inline-flex shrink-0 items-center rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 sm:px-3 sm:text-sm"
												>
													Save
												</button>
											</div>
										{:else}
											<button
												type="button"
												onclick={clearAllFilters}
												class="whitespace-nowrap text-xs font-medium text-warm-400 transition-colors hover:text-warm-600 sm:text-sm"
												aria-label="Clear all filters"
											>
												Clear
											</button>
										{/if}
									</div>
								</div>
							{:else if isEditingSavedView}
								<div class="flex min-w-0 items-center gap-2 sm:gap-3">
									<p
										class="min-w-0 flex-1 truncate text-[10px] font-semibold leading-tight text-brand-600 sm:text-xs"
									>
										Editing<span class="hidden sm:inline">{' view'}</span>
									</p>
									<div
										class="flex shrink-0 items-center gap-2 sm:gap-2.5"
										role="group"
										aria-label="Save or cancel view edits"
									>
										<button
											type="button"
											onclick={discardViewChanges}
											class="whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold text-warm-500 transition-colors hover:bg-warm-100/80 hover:text-warm-800 sm:text-sm"
										>
											Cancel
										</button>
										<button
											type="button"
											onclick={quickUpdateView}
											class="inline-flex shrink-0 items-center rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 sm:px-3 sm:text-sm"
										>
											Save
										</button>
									</div>
								</div>
							{/if}
						</div>
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
							class="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-1.5"
						>
							{enriching ? 'Fetching...' : 'Fetch Details'}
						</button>
					</div>
				{/if}

				{#if enrichResult}
					<div class="mb-1.5 rounded-lg bg-sage-50 p-2 text-xs text-sage-700 sm:mb-4 sm:rounded-xl sm:p-3 sm:text-sm">
						Fetched details for {enrichResult.enriched} of {enrichResult.total} places.
					</div>
				{/if}

				<!-- ======== MOBILE tags row (< lg) ======== -->
				<div class="relative mb-1 lg:hidden">
					<div
						class="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
						use:sortable={{
							onReorder: handleTagReorder,
							itemSelector: '[data-tag-id]',
							idAttribute: 'data-tag-id',
							longPressMs: 500,
							disabled: false
						}}
					>
						{#each userTags as tag (tag.id)}
							{@const isSelected = selectedTagIds.includes(tag.id)}
							<button
								data-tag-id={tag.id}
								onclick={() => toggleTag(tag.id)}
								class="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-all {isSelected ? 'shadow-sm ring-2 ring-offset-1' : 'opacity-80'}"
								style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}; {isSelected ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
							>
								{tag.name}
								{#if isSelected}
									<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<line x1="18" y1="6" x2="6" y2="18" />
										<line x1="6" y1="6" x2="18" y2="18" />
									</svg>
								{/if}
							</button>
						{/each}
						<button
							onclick={() => { showTagManager = !showTagManager; }}
							class="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-warm-300 px-2 py-1 text-xs text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Edit tags"
						>
							<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Edit
						</button>
						{#if userTags.length === 0}
							<span class="shrink-0 text-xs text-warm-400">No custom tags yet</span>
						{/if}
					</div>
					{#if showTagManager}
						<div class="fixed inset-0 z-40" onclick={() => { showTagManager = false; }} role="presentation"></div>
						<div class="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-warm-200 bg-warm-50 shadow-lg">
							<TagManager
								{supabase}
								userId={session?.user?.id ?? ''}
								allTags={userTags}
								onClose={() => { showTagManager = false; }}
								onTagsChanged={refreshTags}
								mode="popover"
							/>
						</div>
					{/if}
				</div>

				<!-- ======== MOBILE saved views row (< lg) ======== -->
				{#if savedViews.length > 0}
					<div class="mb-1 lg:hidden">
						{@render placesSavedViewsBlock()}
					</div>
				{/if}

				<!-- ======== DESKTOP tags row (lg+) ======== -->
				<div class="relative z-10 mb-1 hidden lg:block">
					<div class="flex items-center gap-2.5">
						<span class="shrink-0 text-sm font-bold text-warm-400" style="width: 3rem">Tags</span>
						<div
							class="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
							use:sortable={{
								onReorder: handleTagReorder,
								itemSelector: '[data-tag-id]',
								idAttribute: 'data-tag-id',
								longPressMs: 400,
								disabled: false
							}}
						>
							{#each userTags as tag (tag.id)}
								{@const isSelected = selectedTagIds.includes(tag.id)}
								<button
									data-tag-id={tag.id}
									onclick={() => toggleTag(tag.id)}
									class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold transition-all {isSelected
										? 'shadow-sm ring-2 ring-offset-1'
										: 'opacity-80 hover:opacity-100'}"
									style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}; {isSelected ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
								>
									{tag.name}
									{#if isSelected}
										<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									{/if}
								</button>
							{/each}
							<button
								onclick={() => { showTagManager = !showTagManager; }}
								class="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-warm-300 px-2 py-0.5 text-sm text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600"
								aria-label="Edit tags"
							>
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19" />
									<line x1="5" y1="12" x2="19" y2="12" />
								</svg>
								Edit
							</button>
							{#if userTags.length === 0}
								<span class="shrink-0 text-xs text-warm-400">No custom tags yet</span>
							{/if}
						</div>
					</div>
					{#if showTagManager}
						<div class="fixed inset-0 z-40" onclick={() => { showTagManager = false; }} role="presentation"></div>
						<div class="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-warm-200 bg-warm-50 shadow-lg">
							<TagManager
								{supabase}
								userId={session?.user?.id ?? ''}
								allTags={userTags}
								onClose={() => { showTagManager = false; }}
								onTagsChanged={refreshTags}
								mode="popover"
							/>
						</div>
					{/if}
				</div>

				<!-- ======== DESKTOP saved views row (lg+) ======== -->
				<div class="hidden lg:block">
					{@render placesSavedViewsBlock()}
				</div>

				<!-- Collection scope banner -->
				{#if browseScope.type === 'collection' && activeCollectionName}
					<div class="mb-1.5 flex items-center gap-2 rounded-lg border border-brand-200/60 bg-brand-50/60 px-2.5 py-1.5 sm:mb-3 sm:rounded-xl sm:px-3 sm:py-2">
						<svg class="h-3.5 w-3.5 shrink-0 text-brand-500 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						</svg>
						<span class="flex-1 truncate text-xs font-bold text-brand-700 sm:text-sm">{activeCollectionName}</span>
						<button
							onclick={() => { showAddToCollection = true; }}
							class="shrink-0 rounded-md bg-brand-500 px-2 py-0.5 text-xs font-bold text-white transition-colors hover:bg-brand-600"
						>
							+ Add places
						</button>
						<button
							onclick={() => { browseScope = { type: 'all' }; }}
							class="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold text-brand-500 transition-colors hover:bg-brand-100"
						>
							Show all
						</button>
					</div>
				{/if}

				<!-- Search + sort + view toggle -->
				<div class="mb-1 mt-1 flex items-center gap-2 sm:mb-0 lg:mt-2.5">
					<div class="relative min-w-0 flex-1">
						<input
							bind:this={searchInputEl}
							type="text"
							bind:value={search}
							onkeydown={(e) => { handleSearchKeydown(e); }}
							placeholder="Search places, tags, or paste a Google Maps URL"
							class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3.5 pr-8 text-xs font-medium text-warm-800 transition-colors placeholder:text-warm-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:py-2 sm:pl-4 sm:pr-9 sm:text-sm"
						/>
						{#if urlAdding}
							<svg class="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-brand-500 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
						{:else if detectedUrl}
							<span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-brand-600 sm:text-xs">Enter to add</span>
						{:else if search}
							<button
								onclick={() => { search = ''; searchInputEl?.focus(); }}
								class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600 sm:p-1"
								aria-label="Clear"
							>
								<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						{/if}
					</div>
					<div class="flex shrink-0 ml-auto items-center gap-1.5 sm:gap-2">
					<SaveViewButton
						{supabase}
						userId={session?.user?.id ?? ''}
						{selectedCustomIds}
						{filterMode}
						{selectedSource}
						{sortBy}
						{viewMode}
						{search}
						onViewsChanged={refreshSavedViews}
						{savedViews}
						{activeSavedViewId}
						{viewIsDirty}
						onApply={applySavedView}
					/>
						<!-- Options button + popover -->
						<div class="relative">
							<button
								onclick={() => { mobileOptionsOpen = !mobileOptionsOpen; }}
								class="flex items-center justify-center rounded-lg border border-warm-200 bg-white p-1.5 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-600 sm:py-1.5 sm:px-2"
								aria-label="Sort and view options"
							>
								<svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
									<line x1="4" y1="6" x2="20" y2="6" />
									<line x1="4" y1="12" x2="20" y2="12" />
									<line x1="4" y1="18" x2="20" y2="18" />
									<circle cx="8" cy="6" r="2" fill="currentColor" />
									<circle cx="14" cy="12" r="2" fill="currentColor" />
									<circle cx="10" cy="18" r="2" fill="currentColor" />
								</svg>
							</button>
							{#if mobileOptionsOpen}
								<div class="fixed inset-0 z-40" onclick={() => { mobileOptionsOpen = false; }} role="presentation"></div>
								<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white p-2 shadow-lg">
									<label for="mobile-sort" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">Sort</label>
									<select
										id="mobile-sort"
										bind:value={sortBy}
										onchange={() => { mobileOptionsOpen = false; }}
										class="mb-2.5 w-full rounded-md border border-warm-200 bg-warm-50 px-2 py-1.5 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
									>
										<option value="newest">Recent</option>
										<option value="oldest">Oldest</option>
										<option value="az">A–Z</option>
										<option value="za">Z–A</option>
										<option value="rating">Rating</option>
										<option value="most-tags">Most tagged</option>
										<option value="tag-group">Tag group</option>
									</select>
									<span id="mobile-view-label" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">View</span>
									<div class="flex items-center gap-1 rounded-md border border-warm-200 bg-warm-50 p-0.5" role="group" aria-labelledby="mobile-view-label">
										<button
											onclick={() => { viewMode = 'grid'; mobileOptionsOpen = false; }}
											class="flex-1 flex items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'grid' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
											aria-label="Grid view"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<rect x="3" y="3" width="7" height="7" />
												<rect x="14" y="3" width="7" height="7" />
												<rect x="3" y="14" width="7" height="7" />
												<rect x="14" y="14" width="7" height="7" />
											</svg>
										</button>
										<button
											onclick={() => { viewMode = 'list'; mobileOptionsOpen = false; }}
											class="flex-1 flex items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'list' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
											aria-label="List view"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
							{/if}
						</div>
					</div>
				</div>

{/snippet}

{#snippet placesFiltersAndListBlock()}
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
						<p class="mt-3 text-base text-warm-500">
							{places.length === 0 ? 'No places yet' : 'No places match your filters'}
						</p>
						{#if places.length === 0}
							<a href="/upload" class="mt-2 inline-block text-base text-brand-600 hover:text-brand-700">
								Upload some CSV files to get started
							</a>
						{/if}
					</div>
				{:else if viewMode === 'grid'}
					<div class="grid grid-cols-1 gap-2 @lg:grid-cols-2 @lg:gap-3">
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
								onRatingChanged={updateRating}
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
				<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100">
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
								onRatingChanged={updateRating}
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
{/snippet}

<div class="min-h-[100dvh]">
	{#if isMobile}
		<div class="flex h-[100dvh] flex-col overflow-hidden">
			<MobileMapShell
				places={filteredPlaces}
				{selectedPlaceId}
				{recenterTick}
				onPlaceSelect={handleMapPlaceSelect}
				onPopupPhotoAction={handlePopupPhotoAction}
				onPopupPhotoClick={handlePopupPhotoClick}
				maptilerKey={data.maptilerKey}
				{placePhotos}
			/>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
				<div class="sticky top-0 z-20 border-b border-warm-200/80 bg-sage-100 px-2.5 pt-2 pb-1.5">
					{@render placesControlsBlock()}
				</div>
				<div
					class="mx-auto px-2.5 pt-1 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]"
				>
					{@render placesFiltersAndListBlock()}
				</div>
			</div>
		</div>
	{:else}
		<div class="flex flex-col md:flex-row">
			<div
				class="desktop-map-panel relative z-0 overflow-hidden h-[35vh] shrink-0 border-b border-warm-200 sm:h-[38vh] md:order-2 md:sticky md:top-0 md:h-[100dvh] md:self-start md:border-b-0 md:border-l"
				class:desktop-map-animate={desktopMapAnimating}
				style="--desktop-map-pct: {desktopMapPct}%"
			>
				<MapView places={filteredPlaces} {selectedPlaceId} {recenterTick} onPlaceSelect={handleMapPlaceSelect} onPopupPhotoAction={handlePopupPhotoAction} onPopupPhotoClick={handlePopupPhotoClick} maptilerKey={data.maptilerKey} {placePhotos} />

				<!-- Desktop drag handle (left edge) -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize items-center md:flex"
					class:bg-brand-100={desktopMapDragging}
					onpointerdown={onDesktopHandleDown}
					onpointermove={onDesktopHandleMove}
					onpointerup={onDesktopHandleUp}
					onpointercancel={onDesktopHandleUp}
					ondblclick={onDesktopHandleDblClick}
				>
					<div class="mx-auto h-8 w-1 rounded-full {desktopMapDragging ? 'bg-brand-500' : 'bg-warm-300/70'} transition-colors"></div>
				</div>
			</div>
			<div class="min-w-0 flex-1 md:order-1" style="container-type: inline-size;">
				<div class="sticky top-0 z-20 border-b border-warm-200/80 bg-sage-100 px-2.5 pt-3 pb-2 sm:px-6 sm:pt-4 sm:pb-2.5 md:px-4">
					{@render placesSearchBlock()}
					{@render placesContextualBlock()}
					{@render placesControlsBlock()}
				</div>
				<div
					class="mx-auto px-2.5 sm:px-6 sm:py-1 md:px-4 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]"
				>
					{@render placesFiltersAndListBlock()}
				</div>
			</div>
		</div>
	{/if}

	<!-- Add existing places to collection modal -->
	{#if showAddToCollection && browseScope.type === 'collection'}
		{@const scopeId = browseScope.collectionId}
		{@const members = collectionPlacesMap[scopeId] ?? []}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showAddToCollection = false; }}>
			<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
			<div
				class="relative z-10 flex w-full flex-col border border-warm-200 bg-white shadow-xl sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl"
				style={isMobile ? `height: ${vvHeight}px;` : ''}
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
								<p class="truncate text-xs text-warm-400">{p.area ? `${p.area} · ` : ''}{p.category ?? ''}</p>
							</div>
					{#if p.user_rating}
							<span class="shrink-0 text-xs font-bold text-warm-500"><span class="text-brand-500">★</span> {p.user_rating.toFixed(1)}</span>
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

	<!-- Photo modal (triggered from map popup camera icon) -->
	{#if photoModalPlaceId}
		{@const photoPlace = places.find(p => p.id === photoModalPlaceId)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={closePhotoModal}>
			<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
			<div
				class="relative z-10 flex max-h-[80dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-md sm:rounded-2xl"
				onclick={(e) => e.stopPropagation()}
			>
				<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
					<div class="flex items-center gap-2 min-w-0">
						<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
							<circle cx="12" cy="13" r="4"/>
						</svg>
						<h2 class="truncate text-sm font-bold text-warm-800 sm:text-base">{photoPlace?.title ?? 'Photos'}</h2>
					</div>
					<button onclick={closePhotoModal} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div class="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
					<PhotoGrid {supabase} placeId={photoModalPlaceId} userId={session?.user?.id ?? ''} />
				</div>
			</div>
		</div>
	{/if}

	{#if popupLightbox}
		{@const urls = placePhotos[popupLightbox.placeId] ?? []}
		{#if urls.length > 0}
			<PhotoLightbox
				{urls}
				startIndex={popupLightbox.startIndex}
				onClose={() => { popupLightbox = null; }}
			/>
		{/if}
	{/if}

	<!-- Lightweight toasts for URL add feedback -->
	{#if toasts.length > 0}
		<div class="fixed bottom-[calc(var(--app-dock-reserve,0px)+0.75rem)] left-1/2 z-[55] flex -translate-x-1/2 flex-col items-center gap-2">
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
							<span class="text-xs font-medium opacity-70">{toast.message}</span>
						{:else}
							<span class="text-xs font-medium sm:text-sm">{toast.message}</span>
						{/if}
						{#if toast.actions}
							<span class="mx-0.5 text-warm-300">|</span>
							{#each toast.actions as action}
								<button
									onclick={() => { action.handler(); dismissToast(toast.id); }}
									class="text-xs font-bold underline decoration-current/40 underline-offset-2 transition-colors hover:opacity-80"
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

	{@render placesSearchOverlay()}
</div>

<style>
	.desktop-map-panel {
		width: 100%;
	}
	@media (min-width: 768px) {
		.desktop-map-panel {
			width: var(--desktop-map-pct);
		}
	}
	.desktop-map-animate {
		transition: width 220ms ease-out;
	}
</style>
