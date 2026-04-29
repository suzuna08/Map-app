<script lang="ts">
	import type { Place, Tag, Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections, updateCollection, loadCollectionPlaces, addPlacesToCollection, removePlaceFromCollection, enableSharing, disableSharing, reorderCollections } from '$lib/stores/collections.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { buildPlaceTagsMap, refreshTagsData } from '$lib/stores/places.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';
	import { textColorForBg } from '$lib/tag-colors';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';
	import CollectionScopeHeader from '$lib/components/CollectionScopeHeader.svelte';
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
	let showAddModal = $state(false);
	let addSearch = $state('');
	let addTagFilter = $state<Record<string, boolean>>({});
	let urlStatus = $state<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
	let urlResultPlace = $state<Place | null>(null);
	let urlErrorMessage = $state('');

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
		return () => window.removeEventListener('resize', check);
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

	async function saveBrowseColor(color: string) {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col || col.color === color) return;
		collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, color } : c));
		const ok = await updateCollection(supabase, selectedCollectionId, { color });
		if (ok) {
			showToast('success', '', 'Color updated');
		} else {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, color: col.color } : c));
		}
	}

	async function saveBrowseEmoji(emoji: string | null) {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col) return;
		const prev = col.emoji;
		collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, emoji } : c));
		const ok = await updateCollection(supabase, selectedCollectionId, { emoji });
		if (ok) {
			showToast('success', '', emoji ? `Icon set to ${emoji}` : 'Icon removed');
		} else {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, emoji: prev } : c));
			showToast('error', '', 'Could not save icon');
		}
	}

	async function saveBrowseName(name: string) {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col || col.name === name) return;
		const prev = col.name;
		collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, name } : c));
		const ok = await updateCollection(supabase, selectedCollectionId, { name });
		if (ok) {
			showToast('success', '', 'Name updated');
		} else {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, name: prev } : c));
		}
	}

	async function saveBrowseDescription(description: string) {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col) return;
		const prev = col.description;
		collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, description: description || null } : c));
		const ok = await updateCollection(supabase, selectedCollectionId, { description: description || null });
		if (ok) {
			showToast('success', '', 'Description updated');
		} else {
			collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, description: prev } : c));
		}
	}

	async function handleDeleteSelectedCollection() {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col) return;
		const ok = await deleteCollection(supabase, col.id);
		if (ok) {
			showToast('info', '', `Deleted "${col.name}"`);
			deselectCollection();
			await refresh();
		} else {
			showToast('error', '', 'Could not delete collection');
		}
	}

	async function browseToggleSharing() {
		if (!selectedCollectionId) return;
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col) return;
		if (col.visibility === 'link_access') {
			const ok = await disableSharing(supabase, col.id);
			if (ok) {
				collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, visibility: 'private' as const, share_slug: null } : c));
				showToast('success', '', 'Sharing disabled');
			}
		} else {
			const slug = await enableSharing(supabase, col.id);
			if (slug) {
				collections = collections.map((c) => (c.id === selectedCollectionId ? { ...c, visibility: 'link_access' as const, share_slug: slug } : c));
				showToast('success', '', 'Sharing enabled — link copied');
				const url = `${window.location.origin}/c/${slug}`;
				navigator.clipboard.writeText(url);
			}
		}
	}

	function browseCopyShareLink() {
		const col = collections.find((c) => c.id === selectedCollectionId);
		if (!col?.share_slug) return;
		const url = `${window.location.origin}/c/${col.share_slug}`;
		navigator.clipboard.writeText(url);
		showToast('success', '', 'Share link copied');
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

	async function openAddModal() {
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
	<title>{selectedCollection ? `${selectedCollection.name} — Collections` : 'My Collections'} — MapOrganizer</title>
</svelte:head>

<!-- ========== SINGLE PAGE: Places-style split layout ========== -->

{#if isMobile}
	<!-- Mobile: full-height flex layout with frozen header -->
	<div class="flex h-[100dvh] flex-col overflow-hidden">
		<div class="shrink-0 border-b border-warm-200/60 bg-[#faf7f2]">
			<div class="px-3 pt-3 pb-2.5">
				<div class="mb-2 flex items-center justify-between gap-3">
					<h1 class="text-base font-extrabold text-warm-800">Collections</h1>
					<button onclick={() => { showCreate = true; }} class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700">
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						New Collection
					</button>
				</div>
				{#if collections.length > 0}
					<div
						class="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						use:sortable={{
							onReorder: handleCollectionReorder,
							itemSelector: '[data-col-id]',
							idAttribute: 'data-col-id',
							longPressMs: 500
						}}
					>
						{#each collections as col (col.id)}
							<button
								data-col-id={col.id}
								onclick={() => selectCollection(col.id)}
								class="group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all
									{selectedCollectionId === col.id ? 'border-brand-200 bg-brand-50 text-warm-800' : 'border-transparent text-warm-500 hover:bg-warm-100 hover:text-warm-700'}"
							>
								<CollectionAvatar color={col.color} emoji={col.emoji} size="xs" />
								<p class="truncate text-xs font-bold">{col.name}</p>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if selectedCollection && !browseLoading}
			<div class="shrink-0">
				<CollectionScopeHeader
					collection={selectedCollection}
					{collections}
					{collectionPlacesMap}
					totalCount={browsePlaces.length}
					onAddPlaces={openAddModal}
					onColorChange={saveBrowseColor}
					onEmojiChange={saveBrowseEmoji}
					onCopyShareLink={browseCopyShareLink}
					onToggleSharing={browseToggleSharing}
					onNameChange={saveBrowseName}
					onDescriptionChange={saveBrowseDescription}
					onDeleteCollection={handleDeleteSelectedCollection}
				/>
			</div>
			<MobileMapShell places={filteredPlaces} {selectedPlaceId} {recenterTick} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} placePhotos={data.placePhotos} />
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
				<div class="mx-auto px-2.5 pt-1 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
					<!-- Controls bar -->
					<div class="mb-1.5 flex items-center gap-2">
						<span class="shrink-0 text-xs font-semibold text-warm-400">{browsePlaces.length} {browsePlaces.length === 1 ? 'place' : 'places'}</span>
						<div class="relative min-w-0 flex-1">
							<input type="text" bind:value={search} placeholder="Search..." class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3.5 pr-8 text-xs font-medium text-warm-800 transition-colors placeholder:text-warm-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" />
							{#if search}<button onclick={() => { search = ''; }} class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600" aria-label="Clear search"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>{/if}
						</div>
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
		<!-- RIGHT: Map only (sticky sidebar, same as Places) -->
		<div class="relative z-0 h-[35vh] shrink-0 border-b border-warm-200 sm:h-[38vh] lg:order-2 lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[42%] lg:self-start lg:border-b-0 lg:border-l">
			<MapView places={filteredPlaces} {selectedPlaceId} {recenterTick} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} placePhotos={data.placePhotos} />
		</div>

		<!-- LEFT: Collection hub + Header + controls + place cards -->
		<div class="min-w-0 flex-1 lg:order-1">
			<!-- Sticky collection hub + scope header -->
			<div class="sticky top-0 z-20">
				<div class="border-b border-warm-200/60 bg-[#faf7f2] px-3 pt-3 pb-2.5 sm:px-4 sm:pt-3 sm:pb-2.5 lg:px-4">
					<div class="mb-2 flex items-center justify-between gap-3">
						<h1 class="text-base font-extrabold text-warm-800 sm:text-lg">Collections</h1>
						<button onclick={() => { showCreate = true; }} class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm">
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
							New Collection
						</button>
					</div>
					{#if collections.length > 0}
						<div
							class="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							use:sortable={{
								onReorder: handleCollectionReorder,
								itemSelector: '[data-col-id]',
								idAttribute: 'data-col-id',
								longPressMs: 500
							}}
						>
							{#each collections as col (col.id)}
							<button
								data-col-id={col.id}
								onclick={() => selectCollection(col.id)}
								class="group flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all sm:gap-2 sm:px-2.5 sm:py-1.5
									{selectedCollectionId === col.id ? 'border-brand-200 bg-brand-50 text-warm-800' : 'border-transparent text-warm-500 hover:bg-warm-100 hover:text-warm-700'}"
							>
									<CollectionAvatar color={col.color} emoji={col.emoji} size="xs" />
									<p class="truncate text-xs font-bold sm:text-sm">{col.name}</p>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#if selectedCollection && !browseLoading}
					<CollectionScopeHeader
						collection={selectedCollection}
						{collections}
						{collectionPlacesMap}
						totalCount={browsePlaces.length}
						onAddPlaces={openAddModal}
						onColorChange={saveBrowseColor}
						onEmojiChange={saveBrowseEmoji}
						onCopyShareLink={browseCopyShareLink}
						onToggleSharing={browseToggleSharing}
						onNameChange={saveBrowseName}
						onDescriptionChange={saveBrowseDescription}
						onDeleteCollection={handleDeleteSelectedCollection}
					/>
				{/if}
			</div>

			{#if selectedCollection && !browseLoading}
				<div class="mx-auto px-2.5 py-3 sm:px-6 sm:py-4 lg:px-4 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
					<!-- Controls bar -->
					<div class="mb-3 flex items-center gap-2">
						<span class="shrink-0 text-xs font-semibold text-warm-400 sm:text-base">{browsePlaces.length} {browsePlaces.length === 1 ? 'place' : 'places'}</span>
						<div class="relative min-w-0 flex-1">
							<input type="text" bind:value={search} placeholder="Search..." class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3.5 pr-8 text-xs font-medium text-warm-800 transition-colors placeholder:text-warm-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:py-2 sm:pl-4 sm:pr-9 sm:text-sm" />
							{#if search}<button onclick={() => { search = ''; }} class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600 sm:p-1" aria-label="Clear search"><svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>{/if}
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

<!-- Create collection modal -->
{#if showCreate}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showCreate = false; newName = ''; selectedColor = COLORS[0]; selectedEmoji = null; }}>
		<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
		<div class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-md sm:rounded-2xl" onclick={(e) => e.stopPropagation()}>
			<div class="flex shrink-0 items-center justify-between border-b border-warm-100 px-5 py-4">
				<h2 class="text-base font-bold text-warm-800">Create collection</h2>
				<button onclick={() => { showCreate = false; newName = ''; selectedColor = COLORS[0]; selectedEmoji = null; }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</button>
			</div>
			<div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
				<div>
					<label for="col-name" class="mb-1.5 block text-sm font-semibold text-warm-700">Name</label>
					<div class="flex items-center gap-3">
						<CollectionAvatar color={selectedColor} emoji={selectedEmoji} size="lg" />
						<input id="col-name" type="text" bind:value={newName} onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { showCreate = false; newName = ''; } }} placeholder="e.g. Weekend Brunch Spots" class="min-w-0 flex-1 rounded-xl border border-warm-200 bg-warm-50 px-3.5 py-2.5 text-sm font-medium text-warm-800 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" autofocus />
					</div>
				</div>
				<div>
					<label class="mb-1.5 block text-sm font-semibold text-warm-700">Icon</label>
					<EmojiPicker selected={selectedEmoji} onSelect={(em) => { selectedEmoji = em; }} />
				</div>
				<div>
					<label class="mb-1.5 block text-sm font-semibold text-warm-700">Accent color</label>
					<div class="flex items-center gap-2">
						{#each COLORS as color}
							<button onclick={() => { selectedColor = color; }} class="h-7 w-7 rounded-full transition-all {selectedColor === color ? 'ring-2 ring-offset-2 ring-warm-400 scale-110' : 'hover:scale-110'}" style="background-color: {color}" aria-label="Select color"></button>
						{/each}
					</div>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-3 border-t border-warm-100 px-5 py-4 pb-[max(1rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+0.25rem))] sm:pb-4">
				<button onclick={handleCreate} disabled={!newName.trim() || creating} class="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">{creating ? 'Creating...' : 'Create collection'}</button>
				<button onclick={() => { showCreate = false; newName = ''; selectedColor = COLORS[0]; selectedEmoji = null; }} class="rounded-xl px-4 py-2.5 text-sm font-medium text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600">Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- Add places modal -->
{#if showAddModal && selectedCollectionId}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }}>
		<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
		<div class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
				<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {selectedCollection?.name}</h2>
				<button onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
			</div>

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

			<div class="flex-1 overflow-y-auto px-2 py-2 sm:px-3">
				{#each filteredNonMembers as p (p.id)}
					{@const pTags = (modalPlaceTagsMap[p.id] ?? []).filter((t) => t.source === 'user')}
					<button onclick={() => handleAddPlace(p.id)} class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50">
						<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{p.title}</p>
							<p class="truncate text-xs text-warm-400">{p.area ? `${p.area} · ` : ''}{p.category ?? ''}</p>
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
		</div>
	</div>
{/if}

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
