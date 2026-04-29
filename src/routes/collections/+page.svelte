<script lang="ts">
	import type { Place, Tag, Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections, updateCollection, loadCollectionPlaces, addPlacesToCollection, removePlaceFromCollection, enableSharing, disableSharing, reorderCollections } from '$lib/stores/collections.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { buildPlaceTagsMap, refreshTagsData } from '$lib/stores/places.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';
	import { textColorForBg } from '$lib/tag-colors';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import MobileMapShell from '$lib/components/MobileMapShell.svelte';
	import { sortable } from '$lib/actions/sortable';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let collections = $state<Collection[]>((data as any).collections ?? []);
	let collectionPlacesMap = $state<CollectionMemberMap>((data as any).collectionPlacesMap ?? {});
	let toasts = $derived(getToasts());

	// Browse mode state
	let selectedCollectionId = $state<string | null>(null);
	let browseLoading = $state(false);
	let browseCache = new Map<string, { places: Place[]; tags: Tag[]; placeTagsMap: Record<string, Tag[]> }>();
	let browsePlaces = $state<Place[]>([]);
	let browseAllTags = $state<Tag[]>([]);
	let browsePlaceTagsMap = $state<Record<string, Tag[]>>({});

	let search = $state('');
	let sortBy = $state<'newest' | 'az' | 'rating'>('newest');
	let viewMode = $state<'grid' | 'list'>('grid');
	let collectionOptionsOpen = $state(false);
	let selectedPlaceId = $state<string | null>(null);
	let recenterTick = $state(0);
	let isMobile = $state(false);
	let vvHeight = $state(0);
	let showAddModal = $state(false);
	let addSearch = $state('');
	let addTagFilter = $state<Record<string, boolean>>({});
	let urlStatus = $state<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
	let urlResultPlace = $state<Place | null>(null);
	let urlErrorMessage = $state('');

	// Per-collection three-dot menu
	let tabMenuOpenId = $state<string | null>(null);
	let tabMenuEl = $state<HTMLDivElement | null>(null);
	let tabConfirmDeleteId = $state<string | null>(null);

	// Edit collection modal
	let editingCollectionId = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let editEmoji = $state<string | null>(null);

	// Share dropdown
	let shareDropdownOpen = $state(false);
	let shareDropdownEl = $state<HTMLDivElement | null>(null);
	let linkCopied = $state(false);

	// Tab menu position (fixed positioning to escape overflow clipping)
	let tabMenuPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

	// Create/Edit popover position
	let createPopoverPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

	// Add places popover position (desktop)
	let addPopoverPos = $state<{ top: number; right: number }>({ top: 0, right: 0 });

	// Desktop map resize
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

	function closeTabMenu() { tabMenuOpenId = null; tabConfirmDeleteId = null; }
	function closeShareDropdown() { shareDropdownOpen = false; linkCopied = false; }

	$effect(() => {
		if (!tabMenuOpenId) { tabConfirmDeleteId = null; return; }
		function handler(e: MouseEvent) {
			if (tabMenuEl && !tabMenuEl.contains(e.target as Node)) closeTabMenu();
		}
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});

	$effect(() => {
		if (!shareDropdownOpen) return;
		function handler(e: MouseEvent) {
			if (shareDropdownEl && !shareDropdownEl.contains(e.target as Node)) closeShareDropdown();
		}
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});

	function openEditCollection(colId: string) {
		const col = collections.find((c) => c.id === colId);
		if (!col) return;
		editingCollectionId = colId;
		editName = col.name;
		editColor = col.color ?? COLORS[0];
		editEmoji = col.emoji ?? null;
		closeTabMenu();
	}

	async function handleSaveEditCollection() {
		if (!editingCollectionId) return;
		const trimmed = editName.trim();
		if (!trimmed) return;
		const col = collections.find((c) => c.id === editingCollectionId);
		if (!col) return;

		const updates: Record<string, unknown> = {};
		if (trimmed !== col.name) updates.name = trimmed;
		if (editColor !== col.color) updates.color = editColor;
		if (editEmoji !== col.emoji) updates.emoji = editEmoji;

		if (Object.keys(updates).length === 0) {
			editingCollectionId = null;
			return;
		}

		const prev = { name: col.name, color: col.color, emoji: col.emoji };
		collections = collections.map((c) =>
			c.id === editingCollectionId
				? { ...c, name: trimmed, color: editColor, emoji: editEmoji }
				: c
		);
		editingCollectionId = null;

		const ok = await updateCollection(supabase, col.id, updates as any);
		if (ok) {
			showToast('success', '', 'Collection updated');
		} else {
			collections = collections.map((c) =>
				c.id === col.id ? { ...c, ...prev } : c
			);
			showToast('error', '', 'Could not update collection');
		}
	}

	async function handleDeleteCollectionById(colId: string) {
		const col = collections.find((c) => c.id === colId);
		if (!col) return;
		const ok = await deleteCollection(supabase, col.id);
		if (ok) {
			showToast('info', '', `Deleted "${col.name}"`);
			if (selectedCollectionId === colId) deselectCollection();
			await refresh();
		} else {
			showToast('error', '', 'Could not delete collection');
		}
		closeTabMenu();
	}

	async function handleShareButtonClick() {
		if (!selectedCollection) return;
		if (selectedCollection.visibility === 'link_access') {
			shareDropdownOpen = !shareDropdownOpen;
		} else {
			const slug = await enableSharing(supabase, selectedCollection.id);
			if (slug) {
				collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, visibility: 'link_access' as const, share_slug: slug } : c));
				const url = `${window.location.origin}/c/${slug}`;
				navigator.clipboard.writeText(url);
				showToast('success', '', 'Sharing enabled — link copied');
			}
		}
	}

	async function handleCopyLink() {
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col?.share_slug) return;
		const url = `${window.location.origin}/c/${col.share_slug}`;
		navigator.clipboard.writeText(url);
		linkCopied = true;
		setTimeout(() => { linkCopied = false; }, 2000);
	}

	async function handleTurnOffSharing() {
		if (!selectedCollectionId) return;
		const ok = await disableSharing(supabase, selectedCollectionId);
		if (ok) {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, visibility: 'private' as const, share_slug: null } : c));
			showToast('success', '', 'Sharing disabled');
		}
		closeShareDropdown();
	}

	const gmapsPattern = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|share\.google)/i;
	let isUrlMode = $derived(gmapsPattern.test(addSearch.trim()));

	// Drag-to-reorder via sortable action
	function handleCollectionReorder(orderedIds: string[]) {
		const prev = collections;
		collections = orderedIds
			.map((id) => prev.find((c) => c.id === id))
			.filter((c): c is Collection => c !== null);
		reorderCollections(supabase, orderedIds);
	}

	let selectedCollection = $derived(collections.find((c) => c.id === selectedCollectionId) ?? null);
	let shareNotes = $derived(selectedCollection?.share_notes ?? true);
	let sharePhotos = $derived(selectedCollection?.share_photos ?? true);
	let shareTags = $derived(selectedCollection?.share_tags ?? false);

	async function handleShareSettingChange(field: 'share_notes' | 'share_photos' | 'share_tags', value: boolean) {
		if (!selectedCollectionId || !selectedCollection) return;
		const prev = selectedCollection[field];
		collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, [field]: value } : c));
		const ok = await updateCollection(supabase, selectedCollectionId, { [field]: value });
		if (!ok) {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, [field]: prev } : c));
		}
	}

	$effect(() => {
		const urlCol = page.url.searchParams.get('collection');
		if (urlCol && !selectedCollectionId && collections.some((c) => c.id === urlCol)) {
			selectCollection(urlCol);
		} else if (!urlCol && !selectedCollectionId && collections.length > 0) {
			selectCollection(collections[0].id);
		}
	});

	$effect(() => {
		function check() { isMobile = window.innerWidth < 1024; }
		check();
		window.addEventListener('resize', check);

		vvHeight = window.visualViewport?.height ?? window.innerHeight;
		function onVVResize() {
			vvHeight = window.visualViewport?.height ?? window.innerHeight;
		}
		window.visualViewport?.addEventListener('resize', onVVResize);

		return () => {
			window.removeEventListener('resize', check);
			window.visualViewport?.removeEventListener('resize', onVVResize);
		};
	});

	async function selectCollection(id: string) {
		selectedCollectionId = id;
		search = '';
		selectedPlaceId = null;

		const url = new URL(window.location.href);
		url.searchParams.set('collection', id);
		goto(url.pathname + url.search, { replaceState: true, keepFocus: true, noScroll: true });

		const cached = browseCache.get(id);
		if (cached) {
			browsePlaces = cached.places;
			browseAllTags = cached.tags;
			browsePlaceTagsMap = cached.placeTagsMap;
			return;
		}

		browseLoading = true;
		const userId = session?.user?.id ?? '';
		const result = await loadCollectionPlaces(supabase, id, userId);
		const ptMap = buildPlaceTagsMap(result.tags, result.placeTags);
		browsePlaces = result.places;
		browseAllTags = result.tags;
		browsePlaceTagsMap = ptMap;
		browseCache.set(id, { places: result.places, tags: result.tags, placeTagsMap: ptMap });
		browseLoading = false;
	}

	function deselectCollection() {
		selectedCollectionId = null;
		browsePlaces = [];
		search = '';
		selectedPlaceId = null;
		goto('/collections', { replaceState: true, keepFocus: true, noScroll: true });
	}

	let filteredPlaces = $derived(
		browsePlaces.filter((p) => {
			if (!search) return true;
			const s = search.toLowerCase();
			return (
				p.title.toLowerCase().includes(s) ||
				(p.address ?? '').toLowerCase().includes(s) ||
				(p.category ?? '').toLowerCase().includes(s) ||
				(p.area ?? '').toLowerCase().includes(s)
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

	function handleCardSelect(placeId: string) {
		selectedPlaceId = selectedPlaceId === placeId ? null : placeId;
		recenterTick++;
	}

	function toggleTag(_tagId: string) { /* noop in collection browse */ }

	async function refreshTags(optimistic?: { newTags: Tag[]; placeId: string; tagIds: string[] }) {
		if (optimistic) {
			const existingIds = new Set(browseAllTags.map((t) => t.id));
			const added = optimistic.newTags.filter((t) => !existingIds.has(t.id));
			if (added.length > 0) browseAllTags = [...browseAllTags, ...added];
			const current = browsePlaceTagsMap[optimistic.placeId] ?? [];
			const currentIds = new Set(current.map((t) => t.id));
			const newLinks = optimistic.newTags.filter((t) => !currentIds.has(t.id));
			if (newLinks.length > 0) {
				browsePlaceTagsMap = { ...browsePlaceTagsMap, [optimistic.placeId]: [...current, ...newLinks] };
			}
			if (selectedCollectionId) {
				browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
			}
			return;
		}
		const userId = session?.user?.id;
		const result = await refreshTagsData(supabase, userId);
		browseAllTags = result.tags;
		browsePlaceTagsMap = buildPlaceTagsMap(browseAllTags, result.placeTags);
		if (selectedCollectionId) {
			browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
		}
	}

	function updateNote(placeId: string, note: string) {
		browsePlaces = browsePlaces.map((p) => (p.id === placeId ? { ...p, note } : p));
		if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
	}

	function updateRating(placeId: string, rating: number | null) {
		browsePlaces = browsePlaces.map((p) =>
			p.id === placeId
				? { ...p, user_rating: rating, user_rated_at: rating != null ? new Date().toISOString() : null }
				: p
		);
		if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
	}

	async function handleRemovePlace(placeId: string) {
		if (!selectedCollectionId) return;
		const colId = selectedCollectionId;
		const removedPlace = browsePlaces.find((p) => p.id === placeId);
		await removePlaceFromCollection(supabase, colId, placeId);
		browsePlaces = browsePlaces.filter((p) => p.id !== placeId);
		collectionPlacesMap = { ...collectionPlacesMap, [colId]: (collectionPlacesMap[colId] ?? []).filter((id) => id !== placeId) };
		if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
		showToast('info', '', 'Removed from collection', [
			{
				label: 'Undo',
				handler: async () => {
					await addPlacesToCollection(supabase, colId, [placeId]);
					if (removedPlace) browsePlaces = [...browsePlaces, removedPlace];
					collectionPlacesMap = { ...collectionPlacesMap, [colId]: [...(collectionPlacesMap[colId] ?? []), placeId] };
					if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
				}
			}
		]);
	}

	async function handleDeletePlace(placeId: string) {
		await supabase.from('places').delete().eq('id', placeId);
		browsePlaces = browsePlaces.filter((p) => p.id !== placeId);
		if (selectedCollectionId) {
			collectionPlacesMap = { ...collectionPlacesMap, [selectedCollectionId]: (collectionPlacesMap[selectedCollectionId] ?? []).filter((id) => id !== placeId) };
			browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
		}
		showToast('info', '', 'Place deleted');
	}

	// Add places modal
	let allUserPlaces = $state<Place[]>([]);
	let allModalTags = $state<Tag[]>([]);
	let modalPlaceTagsMap = $state<Record<string, Tag[]>>({});

	async function openAddModal(e?: MouseEvent) {
		if (e && !isMobile) {
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			addPopoverPos = { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) };
		}
		showAddModal = true;
		addSearch = '';
		addTagFilter = {};
		urlStatus = 'idle';
		urlResultPlace = null;
		urlErrorMessage = '';
		const userId = session?.user?.id ?? '';
		const [placesResult, tagsResult] = await Promise.all([
			supabase
				.from('places')
				.select('id, title, area, category, description, address, user_rating')
				.eq('user_id', userId)
				.order('created_at', { ascending: false }),
			refreshTagsData(supabase, userId)
		]);
		allUserPlaces = (placesResult.data ?? []) as Place[];
		allModalTags = tagsResult.tags;
		modalPlaceTagsMap = buildPlaceTagsMap(tagsResult.tags, tagsResult.placeTags);
	}

	let userModalTags = $derived(allModalTags.filter((t) => t.source === 'user').sort((a, b) => a.name.localeCompare(b.name)));
	let addSelectedTagIds = $derived(Object.keys(addTagFilter).filter((id) => addTagFilter[id]));

	function toggleAddTagFilter(tagId: string) {
		const copy = { ...addTagFilter };
		if (copy[tagId]) { delete copy[tagId]; } else { copy[tagId] = true; }
		addTagFilter = copy;
	}

	let filteredNonMembers = $derived(
		allUserPlaces
			.filter((p) => !(collectionPlacesMap[selectedCollectionId ?? ''] ?? []).includes(p.id))
			.filter((p) => {
				if (addSearch && !isUrlMode) {
					const pTags = modalPlaceTagsMap[p.id] ?? [];
					const terms = addSearch.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
					if (terms.length > 0) {
						const haystack = [
							p.title,
							p.description ?? '',
							p.address ?? '',
							p.category ?? '',
							p.area ?? '',
							...pTags.map((t) => t.name)
						].join(' ').toLowerCase();
						if (!terms.every((term) => haystack.includes(term))) return false;
					}
				}
				if (addSelectedTagIds.length > 0) {
					const pTagIds = (modalPlaceTagsMap[p.id] ?? []).map((t) => t.id);
					if (!addSelectedTagIds.every((id) => pTagIds.includes(id))) return false;
				}
				return true;
			})
	);

	async function handleAddByUrl() {
		const trimmed = addSearch.trim();
		if (!trimmed) return;

		urlStatus = 'loading';
		urlErrorMessage = '';
		urlResultPlace = null;

		try {
			const res = await fetch('/api/places/add-by-url', {
				method: 'POST',
				cache: 'no-store',
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
				body: JSON.stringify({ url: trimmed })
			});

			const data = await res.json();

			if (!res.ok) {
				urlStatus = 'error';
				urlErrorMessage = data.message || data.error?.message || 'Something went wrong';
				return;
			}

			const place = data.place as Place;
			urlResultPlace = place;
			urlStatus = data.duplicate ? 'duplicate' : 'success';

			if (selectedCollectionId && !(collectionPlacesMap[selectedCollectionId] ?? []).includes(place.id)) {
				const colId = selectedCollectionId;
				await addPlacesToCollection(supabase, colId, [place.id]);
				collectionPlacesMap = { ...collectionPlacesMap, [colId]: [...(collectionPlacesMap[colId] ?? []), place.id] };
				if (!allUserPlaces.find((p) => p.id === place.id)) {
					allUserPlaces = [...allUserPlaces, place];
				}
				const { data: placeData } = await supabase
					.from('places')
					.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at')
					.eq('id', place.id)
					.single();
				if (placeData) {
					browsePlaces = [...browsePlaces, placeData as Place];
					if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
				}
				showToast('success', '', `Added "${place.title}" to collection`);
			} else {
				showToast('info', '', `"${place.title}" is already in this collection`);
			}
		} catch {
			urlStatus = 'error';
			urlErrorMessage = 'Network error. Please check your connection and try again.';
		}
	}

	function resetUrl() {
		addSearch = '';
		urlStatus = 'idle';
		urlResultPlace = null;
		urlErrorMessage = '';
	}

	async function handleAddPlace(placeId: string) {
		if (!selectedCollectionId) return;
		const colId = selectedCollectionId;
		await addPlacesToCollection(supabase, colId, [placeId]);
		collectionPlacesMap = { ...collectionPlacesMap, [colId]: [...(collectionPlacesMap[colId] ?? []), placeId] };
		const { data: placeData } = await supabase
			.from('places')
			.select('id, user_id, title, note, url, source_list, created_at, google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at, user_rating, user_rated_at')
			.eq('id', placeId)
			.single();
		if (placeData) {
			browsePlaces = [...browsePlaces, placeData as Place];
			if (selectedCollectionId) browseCache.set(selectedCollectionId, { places: browsePlaces, tags: browseAllTags, placeTagsMap: browsePlaceTagsMap });
		}
		showToast('success', '', 'Added to collection');
	}

	// --- Overview mode (collection cards) ---
	let showCreate = $state(false);
	let newName = $state('');
	let creating = $state(false);

	const COLORS = [
		'#A5834F', '#8C8B82', '#7489A6', '#936756', '#5B7D8A',
		'#6A6196'
	];
	let selectedColor = $state(COLORS[0]);
	let selectedEmoji = $state<string | null>(null);

	const OLD_TO_NEW: Record<string, string> = {
		'#6366f1': '#6A6196', '#8b5cf6': '#6A6196', '#ec4899': '#936756', '#f43f5e': '#936756',
		'#f97316': '#A5834F', '#eab308': '#A5834F', '#22c55e': '#8C8B82', '#14b8a6': '#5B7D8A',
		'#3b82f6': '#7489A6', '#7c8a6a': '#8C8B82', '#617054': '#8C8B82', '#98a485': '#8C8B82',
		'#b8c1a8': '#8C8B82', '#637d8e': '#5B7D8A', '#4d6575': '#5B7D8A', '#7e95a6': '#7489A6',
		'#a3b3c0': '#7489A6', '#a8935f': '#A5834F', '#bda87a': '#A5834F', '#978a74': '#8C8B82',
		'#5a5042': '#936756', '#d0c09c': '#A5834F', '#776841': '#A5834F', '#8888b0': '#6A6196',
		'#8a6a38': '#A5834F', '#8a5848': '#936756', '#6b5244': '#936756', '#605080': '#6A6196',
		'#4a3830': '#936756', '#354050': '#5B7D8A', '#4d8090': '#5B7D8A', '#3a6868': '#5B7D8A',
		'#654830': '#A5834F', '#504068': '#6A6196', '#4a7880': '#5B7D8A', '#c0a060': '#A5834F',
		'#a8a0b8': '#6A6196', '#b09060': '#A5834F', '#a88040': '#A5834F', '#8a8880': '#8C8B82',
		'#6888a8': '#7489A6', '#9a6050': '#936756', '#6858a0': '#6A6196', '#5a4a40': '#936756',
		'#2e4050': '#5B7D8A',
	};

	let migrated = false;
	async function migrateOldColors() {
		if (migrated) return;
		migrated = true;
		const colorsSet = new Set(COLORS);
		const toMigrate = collections.filter((c) => c.color && !colorsSet.has(c.color) && OLD_TO_NEW[c.color]);
		if (toMigrate.length === 0) return;
		collections = collections.map((c) => {
			const newColor = c.color && OLD_TO_NEW[c.color];
			return newColor ? { ...c, color: newColor } : c;
		});
		Promise.all(toMigrate.map((c) => updateCollection(supabase, c.id, { color: OLD_TO_NEW[c.color!] })));
	}

	$effect(() => { if (collections.length > 0) migrateOldColors(); });

	async function refresh() {
		const result = await loadCollections(supabase, session?.user?.id);
		collections = result.collections;
		collectionPlacesMap = result.collectionPlacesMap;
	}

	async function handleCreate() {
		const trimmed = newName.trim();
		if (!trimmed || creating) return;
		creating = true;
		const col = await createCollection(supabase, session?.user?.id ?? '', trimmed, { color: selectedColor, emoji: selectedEmoji ?? undefined });
		if (col) {
			showToast('success', '', `Created "${trimmed}"`);
			newName = '';
			showCreate = false;
			selectedColor = COLORS[0];
			selectedEmoji = null;
			await refresh();
		} else {
			showToast('error', '', 'Could not create collection');
		}
		creating = false;
	}

</script>

<svelte:head>
	<title>{selectedCollection ? `${selectedCollection.name} — Collections` : 'My Collections'} — MyPlaces</title>
</svelte:head>

<!-- ========== SINGLE PAGE: Places-style split layout ========== -->

{#if isMobile}
	<!-- Mobile: full-height flex layout -->
	<div class="flex h-[100dvh] flex-col overflow-hidden">
		<!-- Row 1: Collection tabs with + New Collection -->
		<div class="shrink-0 bg-[#faf7f2]">
			<div class="px-3 pt-3">
				<div
					class="relative flex items-center gap-1.5 overflow-x-auto border-b border-warm-200/60 pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					use:sortable={{
						onReorder: handleCollectionReorder,
						itemSelector: '[data-col-id]',
						idAttribute: 'data-col-id',
						longPressMs: 350,
						disabled: collections.length < 2,
						ignoreDragFrom: 'button[aria-label="Collection actions"], button[aria-label="New Collection"]',
					}}
				>
					<button
						onclick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); createPopoverPos = { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)) }; showCreate = true; }}
						class="flex shrink-0 items-center justify-center rounded-lg bg-brand-600 p-2 text-white shadow-sm transition-colors hover:bg-brand-700"
						aria-label="New Collection"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="14" width="8" height="8" rx="1.5" /><path d="M18 15v3h-3a.75.75 0 0 0 0 1.5h3v3a.75.75 0 0 0 1.5 0v-3h3a.75.75 0 0 0 0-1.5h-3v-3a.75.75 0 0 0-1.5 0z" /></svg>
					</button>
				{#each collections as col (col.id)}
						<div class="relative shrink-0" data-col-id={col.id}>
							<button
								onclick={() => selectCollection(col.id)}
								class="group flex items-center gap-1.5 border-b-[3px] pl-2 pr-5 pb-2.5 pt-1.5 text-left transition-all
									{selectedCollectionId === col.id ? 'border-brand-600 text-warm-800' : 'border-transparent text-warm-400 hover:text-warm-600'}"
							>
								<CollectionAvatar color={col.color} emoji={col.emoji} size="xs" />
								<p class="truncate text-xs font-bold">{col.name}</p>
							</button>
							<button
								onclick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); tabMenuPos = { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 168) }; tabMenuOpenId = tabMenuOpenId === col.id ? null : col.id; }}
								class="absolute right-0 top-0 flex items-center justify-center rounded-full p-1 text-warm-300 transition-colors hover:bg-warm-200/60 hover:text-warm-500"
								aria-label="Collection actions"
							>
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
							</button>
							{#if tabMenuOpenId === col.id}
								<div class="fixed inset-0 z-40" onclick={() => closeTabMenu()} role="presentation"></div>
								<div bind:this={tabMenuEl} class="fixed z-50 w-40 rounded-xl border border-warm-200 bg-white py-1 shadow-lg" style="top: {tabMenuPos.top}px; left: {tabMenuPos.left}px;">
									<button
										onclick={() => openEditCollection(col.id)}
										class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-warm-600 transition-colors hover:bg-warm-50"
									>
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
										Edit
									</button>
									{#if tabConfirmDeleteId === col.id}
										<div class="flex items-center gap-1.5 px-3 py-2">
											<button onclick={() => handleDeleteCollectionById(col.id)} class="rounded-md bg-danger-100 px-2 py-1 text-xs font-bold text-danger-700 hover:bg-danger-200">Delete</button>
											<button onclick={() => { tabConfirmDeleteId = null; }} class="text-xs text-warm-400 hover:text-warm-600">Cancel</button>
										</div>
									{:else}
										<button
											onclick={() => { tabConfirmDeleteId = col.id; }}
											class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
										>
											<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
											Delete
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		{#if selectedCollection && !browseLoading}
			<!-- Row 2: Action bar -->
			<div class="shrink-0 border-b border-warm-200/40 bg-[#faf7f2] px-3 py-2">
				<div class="flex items-center gap-1.5">
					<div class="relative min-w-0 flex-1">
						<input type="text" bind:value={search} placeholder="Search..." class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3 pr-7 text-xs font-medium text-warm-800 transition-colors placeholder:text-warm-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" />
						{#if search}<button onclick={() => { search = ''; }} class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600" aria-label="Clear search"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>{/if}
					</div>
					<button onclick={openAddModal} class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700">
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						Add
					</button>
					<!-- Share / Private button -->
					<div class="relative shrink-0" bind:this={shareDropdownEl}>
						<button
							onclick={handleShareButtonClick}
							class="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors
								{selectedCollection.visibility === 'link_access'
									? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100'
									: 'border-warm-200 bg-white text-warm-500 hover:bg-warm-50 hover:text-warm-600'}"
						>
							{#if selectedCollection.visibility === 'link_access'}
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
								Shared
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
							{:else}
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
								Private
							{/if}
						</button>
						{#if shareDropdownOpen && selectedCollection.visibility === 'link_access'}
							<div class="fixed inset-0 z-40" onclick={() => closeShareDropdown()} role="presentation"></div>
							<div class="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-warm-200 bg-white py-1 shadow-lg">
								{#if linkCopied}
									<div class="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-warm-800">
										<svg class="h-3.5 w-3.5 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
										Link copied!
									</div>
								{:else}
									<button onclick={handleCopyLink} class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-warm-600 transition-colors hover:bg-warm-50">
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
										Copy link
									</button>
								{/if}
								<div class="border-t border-warm-100"></div>
								<div class="px-4 pt-3 pb-1">
									<p class="text-xs font-semibold text-warm-400">Visible to others</p>
								</div>
								<button onclick={() => handleShareSettingChange('share_notes', !shareNotes)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
									<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
									<span class="flex-1 text-sm font-medium text-warm-700">Notes</span>
									<div class="relative h-5 w-9 rounded-full transition-colors {shareNotes ? 'bg-brand-500' : 'bg-warm-300'}">
										<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareNotes ? 'left-[18px]' : 'left-0.5'}"></div>
									</div>
								</button>
								<button onclick={() => handleShareSettingChange('share_photos', !sharePhotos)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
									<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
									<span class="flex-1 text-sm font-medium text-warm-700">Photos</span>
									<div class="relative h-5 w-9 rounded-full transition-colors {sharePhotos ? 'bg-brand-500' : 'bg-warm-300'}">
										<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {sharePhotos ? 'left-[18px]' : 'left-0.5'}"></div>
									</div>
								</button>
								<button onclick={() => handleShareSettingChange('share_tags', !shareTags)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
									<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
									<span class="flex-1 text-sm font-medium text-warm-700">Tags</span>
									<div class="relative h-5 w-9 rounded-full transition-colors {shareTags ? 'bg-brand-500' : 'bg-warm-300'}">
										<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareTags ? 'left-[18px]' : 'left-0.5'}"></div>
									</div>
								</button>
								<div class="border-t border-warm-100"></div>
								<button onclick={handleTurnOffSharing} class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50">
									<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
									Turn off sharing
								</button>
							</div>
						{/if}
					</div>
					<!-- Sort & View options -->
					<div class="relative shrink-0">
						<button
							onclick={() => { collectionOptionsOpen = !collectionOptionsOpen; }}
							class="flex items-center justify-center rounded-lg border border-warm-200 bg-white p-1.5 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-600"
							aria-label="Sort and view options"
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
								<line x1="4" y1="6" x2="20" y2="6" />
								<line x1="4" y1="12" x2="20" y2="12" />
								<line x1="4" y1="18" x2="20" y2="18" />
								<circle cx="8" cy="6" r="2" fill="currentColor" />
								<circle cx="14" cy="12" r="2" fill="currentColor" />
								<circle cx="10" cy="18" r="2" fill="currentColor" />
							</svg>
						</button>
						{#if collectionOptionsOpen}
							<div class="fixed inset-0 z-40" onclick={() => { collectionOptionsOpen = false; }} role="presentation"></div>
							<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white p-2 shadow-lg">
								<label for="coll-mob-sort" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">Sort</label>
								<select
									id="coll-mob-sort"
									bind:value={sortBy}
									onchange={() => { collectionOptionsOpen = false; }}
									class="mb-2.5 w-full rounded-md border border-warm-200 bg-warm-50 px-2 py-1.5 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
								>
									<option value="newest">Recent</option>
									<option value="az">A–Z</option>
									<option value="rating">My Rating</option>
								</select>
								<span id="coll-mob-view-label" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">View</span>
								<div class="flex items-center gap-1 rounded-md border border-warm-200 bg-warm-50 p-0.5" role="group" aria-labelledby="coll-mob-view-label">
									<button
										onclick={() => { viewMode = 'grid'; collectionOptionsOpen = false; }}
										class="flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'grid' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
										aria-label="Grid view"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
									</button>
									<button
										onclick={() => { viewMode = 'list'; collectionOptionsOpen = false; }}
										class="flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'list' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
										aria-label="List view"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
			<MobileMapShell places={filteredPlaces} {selectedPlaceId} {recenterTick} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} placePhotos={data.placePhotos} />
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
				<div class="mx-auto px-2.5 pt-1 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
					{#if sortedPlaces.length === 0}
						<div class="py-16 text-center">
							<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
							<p class="mt-3 text-base text-warm-500">{browsePlaces.length === 0 ? 'This collection is empty' : 'No places match your search'}</p>
							{#if browsePlaces.length === 0}<button onclick={openAddModal} class="mt-2 text-base font-semibold text-brand-600 hover:text-brand-700">Add some places</button>{/if}
						</div>
					{:else if viewMode === 'grid'}
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
							{#each sortedPlaces as place (place.id)}
								<PlaceCard {place} placeTags={browsePlaceTagsMap[place.id] ?? []} allTags={browseAllTags} {supabase} userId={session?.user?.id ?? ''} enrichingId={null} onEnrich={() => {}} onDelete={() => handleRemovePlace(place.id)} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
							{/each}
						</div>
					{:else}
						<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100">
							{#each sortedPlaces as place (place.id)}
								<PlaceListItem {place} placeTags={browsePlaceTagsMap[place.id] ?? []} allTags={browseAllTags} {supabase} userId={session?.user?.id ?? ''} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} onDelete={() => handleRemovePlace(place.id)} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{:else if browseLoading}
			<div class="flex flex-1 items-center justify-center">
				<svg class="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
			</div>
		{:else if collections.length === 0}
			<div class="flex-1 py-10 text-center">
				<svg class="mx-auto h-8 w-8 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" /></svg>
				<p class="mt-2 text-sm font-medium text-warm-500">No collections yet</p>
				<button onclick={() => { showCreate = true; }} class="mt-1 text-sm font-semibold text-brand-600 hover:text-brand-700">Create your first collection</button>
			</div>
		{/if}
	</div>

{:else}
	<!-- Desktop: Places-style split layout -->
	<div class="flex flex-col lg:flex-row">
		<!-- RIGHT: Map -->
		<div
			class="desktop-map-panel relative z-0 h-[35vh] shrink-0 border-b border-warm-200 sm:h-[38vh] lg:order-2 lg:sticky lg:top-0 lg:h-[100dvh] lg:self-start lg:border-b-0 lg:border-l"
			class:desktop-map-animate={desktopMapAnimating}
			style="--desktop-map-pct: {desktopMapPct}%"
		>
			<MapView places={filteredPlaces} {selectedPlaceId} {recenterTick} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} placePhotos={data.placePhotos} />

			<!-- Desktop drag handle (left edge) -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize items-center lg:flex"
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

		<!-- LEFT: Collection tabs + action row + place cards -->
		<div class="min-w-0 flex-1 lg:order-1" style="container-type: inline-size;">
			<!-- Sticky top: Row 1 (collection tabs) + Row 2 (action bar) -->
			<div class="sticky top-0 z-20">
				<!-- Row 1: Collection tabs with + New Collection -->
			<div class="bg-[#faf7f2] px-3 pt-3 sm:px-4 sm:pt-3 lg:px-4">
				<div
					class="relative flex items-center gap-1.5 overflow-x-auto border-b border-warm-200/60 pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					use:sortable={{
						onReorder: handleCollectionReorder,
						itemSelector: '[data-col-id]',
						idAttribute: 'data-col-id',
						longPressMs: 350,
						disabled: collections.length < 2,
						ignoreDragFrom: 'button[aria-label="Collection actions"], button[aria-label="New Collection"]',
					}}
				>
						<button
							onclick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); createPopoverPos = { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 308)) }; showCreate = true; }}
							class="flex shrink-0 items-center justify-center rounded-lg bg-brand-600 p-2 text-white shadow-sm transition-colors hover:bg-brand-700"
							aria-label="New Collection"
						>
							<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="14" width="8" height="8" rx="1.5" /><path d="M18 15v3h-3a.75.75 0 0 0 0 1.5h3v3a.75.75 0 0 0 1.5 0v-3h3a.75.75 0 0 0 0-1.5h-3v-3a.75.75 0 0 0-1.5 0z" /></svg>
						</button>
						{#each collections as col (col.id)}
							<div class="relative shrink-0" data-col-id={col.id}>
								<button
									onclick={() => selectCollection(col.id)}
									class="group flex items-center gap-1.5 border-b-[3px] pl-2 pr-5 pb-2.5 pt-1.5 text-left transition-all sm:gap-2 sm:pl-2.5 sm:pr-6
										{selectedCollectionId === col.id ? 'border-brand-600 text-warm-800' : 'border-transparent text-warm-400 hover:text-warm-600'}"
								>
									<CollectionAvatar color={col.color} emoji={col.emoji} size="xs" />
									<p class="truncate text-xs font-bold sm:text-sm">{col.name}</p>
								</button>
								<button
									onclick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); tabMenuPos = { top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 168) }; tabMenuOpenId = tabMenuOpenId === col.id ? null : col.id; }}
									class="absolute right-0 top-0 flex items-center justify-center rounded-full p-1 text-warm-300 transition-colors hover:bg-warm-200/60 hover:text-warm-500"
									aria-label="Collection actions"
								>
									<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
								</button>
								{#if tabMenuOpenId === col.id}
									<div class="fixed inset-0 z-40" onclick={() => closeTabMenu()} role="presentation"></div>
									<div bind:this={tabMenuEl} class="fixed z-50 w-40 rounded-xl border border-warm-200 bg-white py-1 shadow-lg" style="top: {tabMenuPos.top}px; left: {tabMenuPos.left}px;">
										<button
											onclick={() => openEditCollection(col.id)}
											class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-warm-600 transition-colors hover:bg-warm-50"
										>
											<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
											Edit
										</button>
										{#if tabConfirmDeleteId === col.id}
											<div class="flex items-center gap-1.5 px-3 py-2">
												<button onclick={() => handleDeleteCollectionById(col.id)} class="rounded-md bg-danger-100 px-2 py-1 text-xs font-bold text-danger-700 hover:bg-danger-200">Delete</button>
												<button onclick={() => { tabConfirmDeleteId = null; }} class="text-xs text-warm-400 hover:text-warm-600">Cancel</button>
											</div>
										{:else}
											<button
												onclick={() => { tabConfirmDeleteId = col.id; }}
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
											>
												<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
												Delete
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				<!-- Row 2: Action bar (place count, search, add, share) -->
				{#if selectedCollection && !browseLoading}
					<div class="border-b border-warm-200/40 bg-[#faf7f2] px-3 py-2 sm:px-4 lg:px-4">
						<div class="flex items-center gap-2">
							<span class="shrink-0 text-xs font-semibold text-warm-400 sm:text-sm">{browsePlaces.length} {browsePlaces.length === 1 ? 'place' : 'places'}</span>
							<div class="relative min-w-0 flex-1">
								<input type="text" bind:value={search} placeholder="Search..." class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3.5 pr-8 text-xs font-medium text-warm-800 transition-colors placeholder:text-warm-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:py-2 sm:pl-4 sm:pr-9 sm:text-sm" />
								{#if search}<button onclick={() => { search = ''; }} class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600 sm:p-1" aria-label="Clear search"><svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>{/if}
							</div>
							<button onclick={(e) => openAddModal(e)} class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:text-sm">
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
								Add Places
							</button>
							<!-- Share / Private button -->
							<div class="relative shrink-0" bind:this={shareDropdownEl}>
								<button
									onclick={handleShareButtonClick}
									class="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors sm:text-sm
										{selectedCollection.visibility === 'link_access'
											? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100'
											: 'border-warm-200 bg-white text-warm-500 hover:bg-warm-50 hover:text-warm-600'}"
								>
									{#if selectedCollection.visibility === 'link_access'}
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
										Shared
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
									{:else}
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
										Private
									{/if}
								</button>
								{#if shareDropdownOpen && selectedCollection.visibility === 'link_access'}
									<div class="fixed inset-0 z-40" onclick={() => closeShareDropdown()} role="presentation"></div>
									<div class="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-warm-200 bg-white py-1 shadow-lg">
										{#if linkCopied}
											<div class="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-bold text-warm-800">
												<svg class="h-4 w-4 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
												Link copied!
											</div>
										{:else}
											<button onclick={handleCopyLink} class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-warm-600 transition-colors hover:bg-warm-50">
												<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
												Copy link
											</button>
										{/if}
										<div class="border-t border-warm-100"></div>
										<div class="px-4 pt-3 pb-1">
											<p class="text-xs font-semibold text-warm-400">Visible to others</p>
										</div>
										<button onclick={() => handleShareSettingChange('share_notes', !shareNotes)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
											<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
											<span class="flex-1 text-sm font-medium text-warm-700">Notes</span>
											<div class="relative h-5 w-9 rounded-full transition-colors {shareNotes ? 'bg-brand-500' : 'bg-warm-300'}">
												<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareNotes ? 'left-[18px]' : 'left-0.5'}"></div>
											</div>
										</button>
										<button onclick={() => handleShareSettingChange('share_photos', !sharePhotos)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
											<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
											<span class="flex-1 text-sm font-medium text-warm-700">Photos</span>
											<div class="relative h-5 w-9 rounded-full transition-colors {sharePhotos ? 'bg-brand-500' : 'bg-warm-300'}">
												<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {sharePhotos ? 'left-[18px]' : 'left-0.5'}"></div>
											</div>
										</button>
										<button onclick={() => handleShareSettingChange('share_tags', !shareTags)} class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50">
											<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
											<span class="flex-1 text-sm font-medium text-warm-700">Tags</span>
											<div class="relative h-5 w-9 rounded-full transition-colors {shareTags ? 'bg-brand-500' : 'bg-warm-300'}">
												<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareTags ? 'left-[18px]' : 'left-0.5'}"></div>
											</div>
										</button>
										<div class="border-t border-warm-100"></div>
										<button onclick={handleTurnOffSharing} class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50">
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
											Turn off sharing
										</button>
									</div>
								{/if}
							</div>
							<div class="relative shrink-0">
								<button
									onclick={() => { collectionOptionsOpen = !collectionOptionsOpen; }}
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
								{#if collectionOptionsOpen}
									<div class="fixed inset-0 z-40" onclick={() => { collectionOptionsOpen = false; }} role="presentation"></div>
									<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white p-2 shadow-lg">
										<label for="coll-desk-sort" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">Sort</label>
										<select
											id="coll-desk-sort"
											bind:value={sortBy}
											onchange={() => { collectionOptionsOpen = false; }}
											class="mb-2.5 w-full rounded-md border border-warm-200 bg-warm-50 px-2 py-1.5 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
										>
											<option value="newest">Recent</option>
											<option value="az">A–Z</option>
											<option value="rating">My Rating</option>
										</select>
										<span id="coll-desk-view-label" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">View</span>
										<div class="flex items-center gap-1 rounded-md border border-warm-200 bg-warm-50 p-0.5" role="group" aria-labelledby="coll-desk-view-label">
											<button
												onclick={() => { viewMode = 'grid'; collectionOptionsOpen = false; }}
												class="flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'grid' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
												aria-label="Grid view"
											>
												<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
											</button>
											<button
												onclick={() => { viewMode = 'list'; collectionOptionsOpen = false; }}
												class="flex flex-1 items-center justify-center rounded px-2 py-1.5 transition-colors {viewMode === 'list' ? 'bg-white text-warm-700 shadow-sm' : 'text-warm-400 hover:text-warm-600'}"
												aria-label="List view"
											>
												<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
											</button>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>

			{#if selectedCollection && !browseLoading}
				<div class="mx-auto px-2.5 py-3 sm:px-6 sm:py-4 lg:px-4 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
					{#if sortedPlaces.length === 0}
						<div class="py-16 text-center">
							<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
							<p class="mt-3 text-base text-warm-500">{browsePlaces.length === 0 ? 'This collection is empty' : 'No places match your search'}</p>
							{#if browsePlaces.length === 0}<button onclick={openAddModal} class="mt-2 text-base font-semibold text-brand-600 hover:text-brand-700">Add some places</button>{/if}
						</div>
					{:else if viewMode === 'grid'}
						<div class="grid grid-cols-1 gap-2 @lg:grid-cols-2 @lg:gap-3">
							{#each sortedPlaces as place (place.id)}
								<PlaceCard {place} placeTags={browsePlaceTagsMap[place.id] ?? []} allTags={browseAllTags} {supabase} userId={session?.user?.id ?? ''} enrichingId={null} onEnrich={() => {}} onDelete={() => handleRemovePlace(place.id)} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
							{/each}
						</div>
					{:else}
						<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100">
							{#each sortedPlaces as place (place.id)}
								<PlaceListItem {place} placeTags={browsePlaceTagsMap[place.id] ?? []} allTags={browseAllTags} {supabase} userId={session?.user?.id ?? ''} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} onDelete={() => handleRemovePlace(place.id)} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
							{/each}
						</div>
					{/if}
				</div>
			{:else if browseLoading}
				<div class="flex items-center justify-center py-20">
					<svg class="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
				</div>
			{:else if collections.length === 0}
				<div class="py-10 text-center">
					<svg class="mx-auto h-8 w-8 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" /></svg>
					<p class="mt-2 text-sm font-medium text-warm-500">No collections yet</p>
					<button onclick={() => { showCreate = true; }} class="mt-1 text-sm font-semibold text-brand-600 hover:text-brand-700">Create your first collection</button>
				</div>
			{:else}
				<div class="py-20 text-center">
					<svg class="mx-auto h-10 w-10 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
					<p class="mt-3 text-base font-medium text-warm-500">Select a collection to start browsing</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Create collection popover -->
{#if showCreate}
	<div class="fixed inset-0 z-[55]" onclick={() => { showCreate = false; newName = ''; selectedColor = COLORS[0]; selectedEmoji = null; }} role="presentation"></div>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed z-[56] w-80 rounded-xl border border-warm-200 bg-white shadow-xl" style="top: {createPopoverPos.top}px; left: {createPopoverPos.left}px; max-height: calc(100dvh - {createPopoverPos.top + 16}px);" onclick={(e) => e.stopPropagation()}>
		<div class="overflow-y-auto p-5 space-y-4" style="max-height: calc(100dvh - {createPopoverPos.top + 64}px);">
			<div>
				<label for="col-name" class="mb-1.5 block text-sm font-semibold text-warm-700">Name</label>
				<div class="flex items-center gap-3">
					<CollectionAvatar color={selectedColor} emoji={selectedEmoji} size="lg" />
					<input id="col-name" type="text" bind:value={newName} onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { showCreate = false; newName = ''; } }} placeholder="e.g. Brunch Spots" class="min-w-0 flex-1 rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm font-medium text-warm-800 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" autofocus />
				</div>
			</div>
			<div>
				<label class="mb-1.5 block text-sm font-semibold text-warm-700">Icon</label>
				<EmojiPicker selected={selectedEmoji} onSelect={(em) => { selectedEmoji = em; }} />
			</div>
			<div>
				<label class="mb-1.5 block text-sm font-semibold text-warm-700">Color</label>
				<div class="flex items-center gap-2">
					{#each COLORS as color}
						<button onclick={() => { selectedColor = color; }} class="h-7 w-7 rounded-full transition-all {selectedColor === color ? 'ring-2 ring-offset-2 ring-warm-400 scale-110' : 'hover:scale-110'}" style="background-color: {color}" aria-label="Select color"></button>
					{/each}
				</div>
			</div>
		</div>
		<div class="flex items-center gap-3 border-t border-warm-100 px-5 py-3.5">
			<button onclick={handleCreate} disabled={!newName.trim() || creating} class="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">{creating ? 'Creating...' : 'Create'}</button>
			<button onclick={() => { showCreate = false; newName = ''; selectedColor = COLORS[0]; selectedEmoji = null; }} class="rounded-lg px-3 py-2 text-sm font-medium text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600">Cancel</button>
		</div>
	</div>
{/if}

<!-- Edit collection popover -->
{#if editingCollectionId}
	{@const editCol = collections.find((c) => c.id === editingCollectionId)}
	<div class="fixed inset-0 z-[55]" onclick={() => { editingCollectionId = null; }} role="presentation"></div>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed z-[56] w-80 rounded-xl border border-warm-200 bg-white shadow-xl" style="top: {tabMenuPos.top}px; left: {Math.max(8, Math.min(tabMenuPos.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 330))}px; max-height: calc(100dvh - {tabMenuPos.top + 16}px);" onclick={(e) => e.stopPropagation()}>
		<div class="overflow-y-auto p-5 space-y-4" style="max-height: calc(100dvh - {tabMenuPos.top + 64}px);">
			<div>
				<label for="edit-col-name" class="mb-1.5 block text-sm font-semibold text-warm-700">Name</label>
				<div class="flex items-center gap-3">
					<CollectionAvatar color={editColor} emoji={editEmoji} size="lg" />
					<input id="edit-col-name" type="text" bind:value={editName} onkeydown={(e) => { if (e.key === 'Enter') handleSaveEditCollection(); if (e.key === 'Escape') { editingCollectionId = null; } }} class="min-w-0 flex-1 rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm font-medium text-warm-800 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" autofocus />
				</div>
			</div>
			<div>
				<label class="mb-1.5 block text-sm font-semibold text-warm-700">Icon</label>
				<EmojiPicker selected={editEmoji} onSelect={(em) => { editEmoji = em; }} />
			</div>
			<div>
				<label class="mb-1.5 block text-sm font-semibold text-warm-700">Color</label>
				<div class="flex items-center gap-2">
					{#each COLORS as color}
						<button onclick={() => { editColor = color; }} class="h-7 w-7 rounded-full transition-all {editColor === color ? 'ring-2 ring-offset-2 ring-warm-400 scale-110' : 'hover:scale-110'}" style="background-color: {color}" aria-label="Select color"></button>
					{/each}
				</div>
			</div>
		</div>
		<div class="flex items-center gap-3 border-t border-warm-100 px-5 py-3.5">
			<button onclick={handleSaveEditCollection} disabled={!editName.trim()} class="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">Save</button>
			<button onclick={() => { editingCollectionId = null; }} class="rounded-lg px-3 py-2 text-sm font-medium text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600">Cancel</button>
		</div>
	</div>
{/if}

<!-- Add places: mobile modal / desktop popover -->
{#if showAddModal && selectedCollectionId}
	{#if isMobile}
		<!-- Mobile: full-screen modal -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }}>
			<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
			<div class="relative z-10 flex w-full flex-col border border-warm-200 bg-[#faf7f2] shadow-xl sm:max-h-[85dvh] sm:max-w-lg sm:rounded-2xl" style={isMobile ? `height: ${vvHeight}px;` : ''} onclick={(e) => e.stopPropagation()}>
				<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
					<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {selectedCollection?.name}</h2>
					<button onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
				</div>
				{@render addPlacesContent()}
			</div>
		</div>
	{:else}
		<!-- Desktop: popover -->
		<div class="fixed inset-0 z-[55]" onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }} role="presentation"></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed z-[56] flex w-[26rem] flex-col rounded-xl border border-warm-200 bg-white shadow-xl"
			style="top: {addPopoverPos.top}px; right: {addPopoverPos.right}px; max-height: calc(100dvh - {addPopoverPos.top + 16}px);"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between border-b border-warm-100 px-4 py-2.5">
				<h2 class="text-sm font-bold text-warm-800">Add places to {selectedCollection?.name}</h2>
				<button onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }} class="rounded-lg p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
			</div>
			{@render addPlacesContent()}
		</div>
	{/if}
{/if}

{#snippet addPlacesContent()}
	<!-- Smart search / URL input -->
	<div class="border-b border-warm-100 px-4 py-2">
		{#if urlStatus === 'loading'}
			<div class="flex items-center gap-2 rounded-lg bg-warm-50 px-3 py-2">
				<svg class="h-4 w-4 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
				<span class="text-sm font-medium text-warm-500">Looking up place...</span>
			</div>
		{:else if (urlStatus === 'success' || urlStatus === 'duplicate') && urlResultPlace}
			<div class="flex items-center gap-2 rounded-lg {urlStatus === 'duplicate' ? 'bg-amber-50' : 'bg-sage-50'} px-3 py-2">
				{#if urlStatus === 'duplicate'}
					<svg class="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				{:else}
					<svg class="h-4 w-4 shrink-0 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-bold {urlStatus === 'duplicate' ? 'text-amber-800' : 'text-sage-800'}">
						{urlStatus === 'duplicate' ? 'Already in library — ' : ''}Added {urlResultPlace.title}
					</p>
					{#if urlResultPlace.address}
						<p class="truncate text-xs text-warm-400">{urlResultPlace.address}</p>
					{/if}
				</div>
				<button
					onclick={resetUrl}
					class="shrink-0 rounded-md px-2 py-1 text-xs font-bold transition-colors {urlStatus === 'duplicate' ? 'text-amber-600 hover:bg-amber-100' : 'text-sage-600 hover:bg-sage-100'}"
				>
					Add another
				</button>
			</div>
		{:else}
			<div class="relative">
				{#if isUrlMode}
					<svg class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</svg>
				{:else}
					<svg class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
				{/if}
				<input
					type="text"
					bind:value={addSearch}
					placeholder="Search places, tags, or paste a Google Maps URL..."
					class="w-full rounded-lg border bg-warm-50 py-1.5 pl-8 text-sm font-medium text-warm-700 placeholder:text-warm-300 focus:outline-none focus:ring-1 focus:ring-brand-400/20
						{isUrlMode ? 'border-brand-300 pr-16 focus:border-brand-400' : 'border-warm-200 pr-3 focus:border-brand-400'}"
					onkeydown={(e) => { if (e.key === 'Enter' && isUrlMode) handleAddByUrl(); }}
					autofocus
				/>
				{#if isUrlMode}
					<button
						onclick={handleAddByUrl}
						class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700"
					>
						Add
					</button>
				{/if}
			</div>
			{#if urlStatus === 'error'}
				<p class="mt-1.5 text-xs font-medium text-red-500">{urlErrorMessage}</p>
			{/if}
		{/if}

		<!-- Tag filter pills -->
		{#if userModalTags.length > 0 && !isUrlMode && urlStatus === 'idle'}
			<div class="mt-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<span class="shrink-0 text-xs font-semibold text-warm-400">Tags:</span>
				{#each userModalTags as tag (tag.id)}
					<button
						onclick={() => toggleAddTagFilter(tag.id)}
						class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold transition-all
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
						class="text-xs font-medium text-warm-400 hover:text-warm-600"
					>Clear</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
		{#each filteredNonMembers as p (p.id)}
			{@const pTags = (modalPlaceTagsMap[p.id] ?? []).filter((t) => t.source === 'user')}
			<button onclick={() => handleAddPlace(p.id)} class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50">
				<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{p.title}</p>
						</div>
				{#if pTags.length > 0}
					<div class="flex shrink-0 items-center gap-1">
						{#each pTags.slice(0, 2) as tag (tag.id)}
							<span
								class="rounded-full px-1.5 py-px text-xs font-semibold"
								style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}"
							>{tag.name}</span>
						{/each}
						{#if pTags.length > 2}
							<span class="text-xs font-bold text-warm-400">+{pTags.length - 2}</span>
						{/if}
					</div>
				{/if}
			</button>
		{:else}
			<p class="py-8 text-center text-sm text-warm-400">{addSearch ? 'No matching places' : 'All your places are already in this collection'}</p>
		{/each}
	</div>
{/snippet}

{#if toasts.length > 0}
	<div class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8">
		{#each toasts as toast (toast.id)}
			<div class="flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in {toast.type === 'success' ? 'border border-sage-200/60 bg-sage-50/95 text-sage-800' : ''} {toast.type === 'error' ? 'border border-red-200/60 bg-red-50/95 text-red-700' : ''} {toast.type === 'info' ? 'border border-blue-200/60 bg-blue-50/95 text-blue-800' : ''}">
				<span class="text-xs font-medium sm:text-sm">{toast.message}</span>
				{#if toast.actions}{#each toast.actions as action}<button onclick={() => { action.handler(); dismissToast(toast.id); }} class="text-xs font-bold underline">{action.label}</button>{/each}{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.desktop-map-panel {
		width: 100%;
	}
	@media (min-width: 1024px) {
		.desktop-map-panel {
			width: var(--desktop-map-pct);
		}
	}
	.desktop-map-animate {
		transition: width 220ms ease-out;
	}
</style>
