<script lang="ts">
	import type { Place, Tag, Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections, updateCollection, loadCollectionPlaces, addPlacesToCollection, removePlaceFromCollection, enableSharing, disableSharing, reorderCollections } from '$lib/stores/collections.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { buildPlaceTagsMap, refreshTagsData } from '$lib/stores/places.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';
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
	let selectedPlaceId = $state<string | null>(null);
	let isMobile = $state(false);
	let showAddModal = $state(false);
	let addSearch = $state('');

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
			const els = document.querySelectorAll(`[data-place-id="${placeId}"]`);
			for (const el of els) {
				if (el instanceof HTMLElement && el.offsetParent !== null) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					break;
				}
			}
		});
	}

	function handleCardSelect(placeId: string) {
		selectedPlaceId = selectedPlaceId === placeId ? null : placeId;
	}

	function toggleTag(_tagId: string) { /* noop in collection browse */ }

	async function refreshTags() {
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

	async function openAddModal() {
		showAddModal = true;
		addSearch = '';
		const userId = session?.user?.id ?? '';
		const { data: ap } = await supabase
			.from('places')
			.select('id, title, area, category, user_rating')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });
		allUserPlaces = (ap ?? []) as Place[];
	}

	let filteredNonMembers = $derived(
		allUserPlaces
			.filter((p) => !(collectionPlacesMap[selectedCollectionId ?? ''] ?? []).includes(p.id))
			.filter((p) => {
				if (!addSearch) return true;
				const s = addSearch.toLowerCase();
				return p.title.toLowerCase().includes(s) || (p.area ?? '').toLowerCase().includes(s) || (p.category ?? '').toLowerCase().includes(s);
			})
	);

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
			<MobileMapShell places={filteredPlaces} {selectedPlaceId} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} />
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
				<div class="mx-auto px-2.5 pt-1 pb-[max(2.5rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+0.25rem))]">
					<!-- Controls bar -->
					<div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
						<span class="text-xs font-semibold text-warm-400">{browsePlaces.length} {browsePlaces.length === 1 ? 'place' : 'places'}</span>
						<div class="flex items-center gap-1.5">
							<select value={sortBy} onchange={(e) => { sortBy = (e.currentTarget as HTMLSelectElement).value as any; }} class="rounded-md border border-warm-200 bg-white px-1.5 py-1 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none">
								<option value="newest">Recent</option>
								<option value="az">A–Z</option>
								<option value="rating">My Rating</option>
							</select>
							<div class="flex items-center gap-0.5 rounded-md border border-warm-200 bg-white p-0.5">
								<button onclick={() => { viewMode = 'grid'; }} class="rounded p-1.5 transition-colors {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}" aria-label="Grid view"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg></button>
								<button onclick={() => { viewMode = 'list'; }} class="rounded p-1.5 transition-colors {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}" aria-label="List view"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg></button>
							</div>
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
			<MapView places={filteredPlaces} {selectedPlaceId} onPlaceSelect={handleMapPlaceSelect} maptilerKey={data.maptilerKey} />
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
				<div class="mx-auto px-2.5 py-3 sm:px-6 sm:py-4 lg:px-4 pb-[max(5rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+2rem))]">
					<!-- Controls bar -->
					<div class="mb-3 flex items-center justify-between">
						<span class="text-xs font-semibold text-warm-400">{browsePlaces.length} {browsePlaces.length === 1 ? 'place' : 'places'}</span>
						<div class="flex items-center gap-1.5 sm:gap-2">
							<div class="relative">
								<svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
								<input type="text" value={search} oninput={(e) => { search = (e.currentTarget as HTMLInputElement).value; }} placeholder="Search..." class="w-28 rounded-lg border border-warm-200 bg-warm-50 py-1 pl-7 pr-7 text-xs font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:w-40 sm:text-sm" />
								{#if search}<button onclick={() => { search = ''; }} class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600" aria-label="Clear search"><svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>{/if}
							</div>
							<select value={sortBy} onchange={(e) => { sortBy = (e.currentTarget as HTMLSelectElement).value as any; }} class="rounded-md border border-warm-200 bg-white px-1.5 py-1 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none sm:text-sm">
								<option value="newest">Recent</option>
								<option value="az">A–Z</option>
								<option value="rating">My Rating</option>
							</select>
							<div class="flex items-center gap-0.5 rounded-md border border-warm-200 bg-white p-0.5">
								<button onclick={() => { viewMode = 'grid'; }} class="rounded p-1.5 transition-colors {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}" aria-label="Grid view"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg></button>
								<button onclick={() => { viewMode = 'list'; }} class="rounded p-1.5 transition-colors {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}" aria-label="List view"><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg></button>
							</div>
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
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showAddModal = false; }}>
		<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
		<div class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl" onclick={(e) => e.stopPropagation()}>
			<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
				<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {selectedCollection?.name}</h2>
				<button onclick={() => { showAddModal = false; }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
			</div>
			<div class="border-b border-warm-100 px-4 py-2">
				<div class="relative">
					<svg class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
					<input type="text" bind:value={addSearch} placeholder="Search places..." class="w-full rounded-lg border border-warm-200 bg-warm-50 py-1.5 pl-8 pr-3 text-sm font-medium text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20" autofocus />
				</div>
			</div>
			<div class="flex-1 overflow-y-auto px-2 py-2 sm:px-3">
				{#each filteredNonMembers as p (p.id)}
					<button onclick={() => handleAddPlace(p.id)} class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50">
						<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{p.title}</p>
							<p class="truncate text-xs text-warm-400">{p.area ? `${p.area} · ` : ''}{p.category ?? ''}</p>
						</div>
						{#if p.user_rating}<span class="shrink-0 text-xs font-bold text-warm-500"><span class="text-brand-500">★</span> {p.user_rating.toFixed(1)}</span>{/if}
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
