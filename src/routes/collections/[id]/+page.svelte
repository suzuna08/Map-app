<script lang="ts">
	import type { Place, Tag, Collection } from '$lib/types/database';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import MapView from '$lib/components/MapView.svelte';
	import MobileMapShell from '$lib/components/MobileMapShell.svelte';
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

	let collection = $state<Collection>(serverCollection);
	let places = $state<Place[]>(serverPlaces);
	let placeIds = $state<string[]>(serverPlaceIds);
	let allTags = $state<Tag[]>(serverTags);
	let placeTagsMap = $state<Record<string, Tag[]>>({});
	let allPlaces = $state<Place[]>([]);

	let prevCollectionId = $state(serverCollection?.id);

	$effect(() => {
		if (serverCollection?.id !== prevCollectionId) {
			prevCollectionId = serverCollection?.id;
			collection = serverCollection;
			places = serverPlaces;
			placeIds = serverPlaceIds;
			allTags = serverTags;
			placeTagsMap = {};
			allPlaces = [];
			editName = serverCollection.name;
			editDesc = serverCollection.description ?? '';
			editingName = false;
			editingDesc = false;
			search = '';
			collectionOptionsOpen = false;
			showAddModal = false;
			addSearch = '';
			addTagFilter = {};
		}
	});

	let toasts = $derived(getToasts());
	let viewMode = $state<'grid' | 'list'>('grid');
	let sortBy = $state<'newest' | 'az' | 'rating'>('newest');
	let search = $state('');
	let collectionOptionsOpen = $state(false);
	let showAddModal = $state(false);
	let addSearch = $state('');
	let addTagFilter = $state<Record<string, boolean>>({});
	let urlStatus = $state<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
	let urlResultPlace = $state<Place | null>(null);
	let urlErrorMessage = $state('');

	const gmapsPattern = /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|share\.google)/i;
	let isUrlMode = $derived(gmapsPattern.test(addSearch.trim()));
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
	let maptilerKey = $derived(data.maptilerKey ?? '');

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
			if (addSearch && !isUrlMode) {
				const pTags = placeTagsMap[p.id] ?? [];
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
		allPlaces = (placesResult.data ?? []) as Place[];
		placeTagsMap = buildPlaceTagsMap(tagsResult.tags, tagsResult.placeTags);
	}

	async function handleRemovePlace(placeId: string) {
		const removedPlace = places.find((p) => p.id === placeId);
		await removePlaceFromCollection(supabase, collection.id, placeId);
		placeIds = placeIds.filter((id) => id !== placeId);
		places = places.filter((p) => p.id !== placeId);
		showToast('info', '', 'Removed from collection', [
			{
				label: 'Undo',
				handler: async () => {
					await addPlacesToCollection(supabase, collection.id, [placeId]);
					placeIds = [...placeIds, placeId];
					if (removedPlace) places = [...places, removedPlace];
				}
			}
		]);
	}

	async function handleDeletePlace(placeId: string) {
		await supabase.from('places').delete().eq('id', placeId);
		placeIds = placeIds.filter((id) => id !== placeId);
		places = places.filter((p) => p.id !== placeId);
		allPlaces = allPlaces.filter((p) => p.id !== placeId);
		showToast('info', '', 'Place deleted');
	}

	async function handleAddPlace(placeId: string) {
		if (placeIds.includes(placeId)) return;
		await addPlacesToCollection(supabase, collection.id, [placeId]);
		placeIds = [...placeIds, placeId];
		const fullPlace = allPlaces.find((p) => p.id === placeId);
		if (fullPlace) {
			places = [...places, fullPlace as Place];
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

			if (data.duplicate) {
				urlStatus = 'duplicate';
			} else {
				urlStatus = 'success';
			}

			if (!placeIds.includes(place.id)) {
				await addPlacesToCollection(supabase, collection.id, [place.id]);
				placeIds = [...placeIds, place.id];
				if (!allPlaces.find((p) => p.id === place.id)) {
					allPlaces = [...allPlaces, place];
				}
				places = [...places, place];
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

<!-- Sticky top panel: header -->
{#if collection}

{#if isMobile}
<!-- ===== MOBILE: MobileMapShell layout ===== -->
<div class="flex h-[100dvh] flex-col overflow-hidden">
	<div class="shrink-0 border-b border-warm-200/80 bg-[#faf7f2]">
		<div class="px-3">
			<div class="flex items-center gap-1.5 pt-2 text-xs text-warm-400">
				<a href="/collections" class="transition-colors hover:text-warm-600">Collections</a>
				<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
				<span class="font-semibold text-warm-600">{collection.name}</span>
			</div>
			<div class="pb-2 pt-1">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2.5">
							<div class="relative" bind:this={colorPickerEl}>
								<button onclick={() => { editingColor = !editingColor; }} class="flex shrink-0 items-center justify-center rounded-full transition-all hover:scale-110" aria-label="Change collection color">
									<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" />
								</button>
								{#if editingColor}
									<div class="absolute left-0 top-full z-20 mt-2 rounded-xl border border-warm-200 bg-white p-2.5 shadow-lg" style="width: max-content; max-width: 280px;">
										<div class="flex flex-wrap gap-1.5">
											{#each COLORS as color}
												<button onclick={() => saveColor(color)} class="h-5.5 w-5.5 rounded-full transition-all {collection.color === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}" style="background-color: {color}" aria-label="Select color"></button>
											{/each}
										</div>
										<div class="mt-2 border-t border-warm-100 pt-2">
											<span class="mb-1 block text-xs font-bold text-warm-400">Icon</span>
											<EmojiPicker selected={collection.emoji ?? null} onSelect={(em) => { saveEmoji(em); }} />
										</div>
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								{#if editingName}
									<input type="text" bind:value={editName} onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }} onblur={saveName} class="w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-base font-extrabold text-warm-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20" autofocus />
								{:else}
									<button type="button" class="cursor-pointer truncate text-left text-base font-extrabold text-warm-800 transition-colors hover:text-brand-600" onclick={() => { editingName = true; editName = collection.name; }}>{collection.name}</button>
								{/if}
								{#if editingDesc}
									<input type="text" bind:value={editDesc} onkeydown={(e) => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') editingDesc = false; }} onblur={saveDescription} placeholder="Add a description..." class="mt-0.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs text-warm-500 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20" autofocus />
								{:else}
									<button type="button" class="mt-0.5 cursor-pointer text-left text-xs text-warm-400 transition-colors hover:text-warm-500" onclick={() => { editingDesc = true; editDesc = collection.description ?? ''; }}>{collection.description || 'Add a description...'}</button>
								{/if}
							</div>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1.5">
						{#if collection.visibility === 'link_access'}
							<button onclick={copyShareLink} class="rounded-md p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600" aria-label="Copy share link">
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
							</button>
						{/if}
						<button onclick={toggleSharing} class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-colors {collection.visibility === 'link_access' ? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100' : 'border-warm-200 text-warm-500 hover:bg-warm-50'}">
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{#if collection.visibility === 'link_access'}<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />{:else}<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />{/if}</svg>
							{collection.visibility === 'link_access' ? 'Shared' : 'Private'}
						</button>
						<button onclick={() => { openAddModal(); }} class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700">
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
						</button>
					</div>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2 border-t border-warm-200/60 px-3 py-1.5">
			<p class="shrink-0 text-xs font-semibold text-warm-500">{filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'}</p>
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
						<label for="coll-sort" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">Sort</label>
						<select
							id="coll-sort"
							bind:value={sortBy}
							onchange={() => { collectionOptionsOpen = false; }}
							class="mb-2.5 w-full rounded-md border border-warm-200 bg-warm-50 px-2 py-1.5 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
						>
							<option value="newest">Recent</option>
							<option value="az">A–Z</option>
							<option value="rating">My Rating</option>
						</select>
						<span id="coll-view-label" class="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-warm-400">View</span>
						<div class="flex items-center gap-1 rounded-md border border-warm-200 bg-warm-50 p-0.5" role="group" aria-labelledby="coll-view-label">
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
	<MobileMapShell places={filteredPlaces} {selectedPlaceId} onPlaceSelect={handleMapPlaceSelect} {maptilerKey} placePhotos={data.placePhotos} />
	<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
		<div class="mx-auto px-2.5 pt-1 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
	<!-- Places -->
	{#if sortedPlaces.length === 0}
		<div class="py-16 text-center">
			<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
			</svg>
			<p class="mt-3 text-base text-warm-500">
				{places.length === 0 ? 'This collection is empty' : 'No places match your search'}
			</p>
			{#if places.length === 0}
				<button
					onclick={() => { openAddModal(); }}
					class="mt-2 text-base font-semibold text-brand-600 hover:text-brand-700"
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
					onRemoveFromCollection={(id) => handleRemovePlace(id)}
					onDeletePlace={(id) => handleDeletePlace(id)}
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
					onRemoveFromCollection={(id) => handleRemovePlace(id)}
					onDeletePlace={(id) => handleDeletePlace(id)}
				/>
			{/each}
		</div>
	{/if}
		</div>
	</div>
</div>

{:else}
<!-- ===== DESKTOP: Split map/list layout ===== -->
<div class="min-h-[100dvh]">
	<div class="sticky top-0 z-10 border-b border-warm-200/80 bg-[#faf7f2] shadow-sm">
		<div class="mx-auto max-w-none px-3 sm:px-6 lg:px-4">
			<div class="flex items-center gap-1.5 pt-2 text-xs text-warm-400 sm:pt-2.5 sm:text-sm">
				<a href="/collections" class="transition-colors hover:text-warm-600">Collections</a>
				<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
				<span class="font-semibold text-warm-600">{collection.name}</span>
			</div>
			<div class="pb-2 pt-1 sm:pb-2.5 sm:pt-1.5">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2.5">
							<div class="relative" bind:this={colorPickerEl}>
								<button onclick={() => { editingColor = !editingColor; }} class="flex shrink-0 items-center justify-center rounded-full transition-all hover:scale-110" aria-label="Change collection color">
									<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" />
								</button>
								{#if editingColor}
									<div class="absolute left-0 top-full z-20 mt-2 rounded-xl border border-warm-200 bg-white p-2.5 shadow-lg" style="width: max-content; max-width: 280px;">
										<div class="flex flex-wrap gap-1.5">
											{#each COLORS as color}
												<button onclick={() => saveColor(color)} class="h-5.5 w-5.5 rounded-full transition-all {collection.color === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}" style="background-color: {color}" aria-label="Select color"></button>
											{/each}
										</div>
										<div class="mt-2 border-t border-warm-100 pt-2">
											<span class="mb-1 block text-xs font-bold text-warm-400">Icon</span>
											<EmojiPicker selected={collection.emoji ?? null} onSelect={(em) => { saveEmoji(em); }} />
										</div>
									</div>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								{#if editingName}
									<input type="text" bind:value={editName} onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }} onblur={saveName} class="w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-base font-extrabold text-warm-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:text-lg" autofocus />
								{:else}
									<button type="button" class="cursor-pointer truncate text-left text-base font-extrabold text-warm-800 transition-colors hover:text-brand-600 sm:text-lg" onclick={() => { editingName = true; editName = collection.name; }}>{collection.name}</button>
								{/if}
								{#if editingDesc}
									<input type="text" bind:value={editDesc} onkeydown={(e) => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') editingDesc = false; }} onblur={saveDescription} placeholder="Add a description..." class="mt-0.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs text-warm-500 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:text-sm" autofocus />
								{:else}
									<button type="button" class="mt-0.5 cursor-pointer text-left text-xs text-warm-400 transition-colors hover:text-warm-500 sm:text-sm" onclick={() => { editingDesc = true; editDesc = collection.description ?? ''; }}>{collection.description || 'Add a description...'}</button>
								{/if}
							</div>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
						{#if collection.visibility === 'link_access'}
							<button onclick={copyShareLink} class="rounded-md p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 sm:p-2" aria-label="Copy share link">
								<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
							</button>
						{/if}
						<button onclick={toggleSharing} class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-colors sm:px-3 sm:py-1.5 {collection.visibility === 'link_access' ? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100' : 'border-warm-200 text-warm-500 hover:bg-warm-50'}">
							<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{#if collection.visibility === 'link_access'}<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />{:else}<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />{/if}</svg>
							{collection.visibility === 'link_access' ? 'Shared' : 'Private'}
						</button>
						<button onclick={() => { openAddModal(); }} class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm">
							<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
							<span class="hidden sm:inline">Add Places</span>
						</button>
					</div>
				</div>
			</div>
		</div>
		<div class="mx-auto flex max-w-none items-center gap-2 border-t border-warm-200/60 px-3 py-1.5 sm:px-6 sm:py-2 lg:px-4">
			<p class="shrink-0 text-xs font-semibold text-warm-500 sm:text-base">{filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'}</p>
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
	</div>

	<div class="flex flex-col lg:flex-row">
		<div class="relative z-0 h-[35vh] shrink-0 border-b border-warm-200 sm:h-[38vh] lg:order-2 lg:sticky lg:top-[120px] lg:h-[calc(100dvh-120px)] lg:w-[42%] lg:self-start lg:border-b-0 lg:border-l">
			<MapView places={filteredPlaces} {selectedPlaceId} onPlaceSelect={handleMapPlaceSelect} {maptilerKey} placePhotos={data.placePhotos} />
		</div>
		<div class="min-w-0 flex-1 lg:order-1">
			<div class="mx-auto px-2.5 py-3 sm:px-6 sm:py-4 lg:px-4 pb-[max(8rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+4rem))]">
	{#if sortedPlaces.length === 0}
		<div class="py-16 text-center">
			<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
			<p class="mt-3 text-base text-warm-500">{places.length === 0 ? 'This collection is empty' : 'No places match your search'}</p>
			{#if places.length === 0}
				<button onclick={() => { openAddModal(); }} class="mt-2 text-base font-semibold text-brand-600 hover:text-brand-700">Add some places</button>
			{/if}
		</div>
	{:else if viewMode === 'grid'}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
			{#each sortedPlaces as place (place.id)}
				<PlaceCard {place} placeTags={placeTagsMap[place.id] ?? []} {allTags} {supabase} userId={session?.user?.id ?? ''} enrichingId={null} onEnrich={() => {}} onDelete={() => handleRemovePlace(place.id)} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
			{/each}
		</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border border-warm-200 bg-white divide-y divide-warm-100">
			{#each sortedPlaces as place (place.id)}
				<PlaceListItem {place} placeTags={placeTagsMap[place.id] ?? []} {allTags} {supabase} userId={session?.user?.id ?? ''} onTagClick={toggleTag} onTagsChanged={refreshTags} onNoteChanged={updateNote} onRatingChanged={updateRating} onDelete={() => handleRemovePlace(place.id)} selected={selectedPlaceId === place.id} onSelect={handleCardSelect} onRemoveFromCollection={(id) => handleRemovePlace(id)} onDeletePlace={(id) => handleDeletePlace(id)} />
			{/each}
		</div>
	{/if}
			</div>
		</div>
	</div>
</div>
{/if}
<!-- Add places modal -->
{#if showAddModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }}>
		<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
		<div
			class="relative z-10 flex max-h-[85dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3 sm:px-5">
				<h2 class="text-sm font-bold text-warm-800 sm:text-base">Add places to {collection.name}</h2>
				<button onclick={() => { showAddModal = false; addSearch = ''; addTagFilter = {}; resetUrl(); }} class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
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
			{#if userTags.length > 0 && !isUrlMode && urlStatus === 'idle'}
				<div class="mt-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<span class="shrink-0 text-xs font-semibold text-warm-400">Tags:</span>
					{#each userTags as tag (tag.id)}
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
				{#each nonMemberPlaces as p (p.id)}
					{@const pTags = (placeTagsMap[p.id] ?? []).filter((t) => t.source === 'user')}
					<button
						onclick={() => handleAddPlace(p.id)}
						class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-warm-50"
					>
						<svg class="h-4 w-4 shrink-0 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
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
				{#if toast.actions}
					{#each toast.actions as action}
						<button
							onclick={() => { action.handler(); dismissToast(toast.id); }}
						class="text-xs font-bold underline"
					>{action.label}</button>
				{/each}
			{/if}
		</div>
	{/each}
</div>
{/if}
