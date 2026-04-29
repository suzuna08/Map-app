<script lang="ts">
	import type { Collection, Place } from '$lib/types/database';
	import type { Session } from '@supabase/supabase-js';
	import MapView from '$lib/components/MapView.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { textColorForBg } from '$lib/tag-colors';

	let { data } = $props();
	let collection = (data as any).collection as Collection;
	let places = (data as any).places as Place[];
	let maptilerKey: string = data.maptilerKey ?? '';
	let session: Session | null = (data as any).session ?? null;
	let placePhotos: Record<string, string[]> = (data as any).placePhotos ?? {};
	let placeTags: Record<string, { id: string; name: string; color: string | null }[]> = (data as any).placeTags ?? {};
	let shareSettings: { notes: boolean; photos: boolean; tags: boolean } = (data as any).shareSettings ?? { notes: true, photos: true, tags: false };

	let search = $state('');
	let selectedPlaceId = $state<string | null>(null);
	let recenterTick = $state(0);
	let flippedPlaceId = $state<string | null>(null);
	let saving = $state(false);
	let saved = $state(false);
	let lightboxPlaceId = $state<string | null>(null);
	let lightboxIndex = $state(0);
	let cardMenuPlaceId = $state<string | null>(null);

	// Map resize state (mirrors MobileMapShell)
	const MAP_MIN_HEIGHT = 80;
	const MAP_DEFAULT_HEIGHT = 300;
	const MAP_SNAP_COLLAPSED = 100;
	const MAP_SNAP_EXPANDED_VH = 0.55;

	let mapHeight = $state(MAP_DEFAULT_HEIGHT);
	let mapDragging = $state(false);
	let mapAnimating = $state(false);
	let mapDragStartY = 0;
	let mapDragStartHeight = 0;

	let mapMaxHeight = $derived(typeof window !== 'undefined' ? window.innerHeight * 0.7 : 500);
	let mapMode: 'collapsed' | 'expanded' = 'expanded';

	function clampMapHeight(h: number): number {
		return Math.max(MAP_MIN_HEIGHT, Math.min(h, mapMaxHeight));
	}

	function onMapPointerDown(e: PointerEvent) {
		if (mapAnimating) return;
		mapDragging = true;
		mapDragStartY = e.clientY;
		mapDragStartHeight = mapHeight;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onMapPointerMove(e: PointerEvent) {
		if (!mapDragging) return;
		const delta = e.clientY - mapDragStartY;
		mapHeight = clampMapHeight(mapDragStartHeight + delta);
	}

	function onMapPointerUp() {
		if (!mapDragging) return;
		mapDragging = false;
		const viewH = window.innerHeight;
		mapAnimating = true;
		if (mapHeight < MAP_SNAP_COLLAPSED) {
			mapHeight = MAP_MIN_HEIGHT;
		} else if (mapHeight > viewH * 0.4) {
			mapHeight = clampMapHeight(viewH * MAP_SNAP_EXPANDED_VH);
		}
		setTimeout(() => { mapAnimating = false; }, 220);
	}

	function onMapDoubleTap() {
		mapAnimating = true;
		const viewH = window.innerHeight;
		if (mapHeight > MAP_DEFAULT_HEIGHT + 20) {
			mapHeight = MAP_DEFAULT_HEIGHT;
		} else {
			mapHeight = clampMapHeight(viewH * MAP_SNAP_EXPANDED_VH);
		}
		setTimeout(() => { mapAnimating = false; }, 220);
	}

	let isOwner = $derived(session?.user?.id === collection.user_id);

	async function handleSave() {
		if (!session) {
			goto(`/login?redirect=${encodeURIComponent(page.url.pathname)}`);
			return;
		}
		if (saving || saved) return;

		saving = true;
		try {
			const res = await fetch('/api/collections/save-shared', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ collectionId: collection.id })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Something went wrong' }));
				showToast('error', '', err.message ?? 'Failed to save collection');
				return;
			}

			const result = await res.json();
			saved = true;
			showToast('success', '', 'Collection saved!', [
				{ label: 'View', handler: () => goto(`/collections/${result.id}`) }
			]);
		} catch {
			showToast('error', '', 'Failed to save collection');
		} finally {
			saving = false;
		}
	}

	let mappablePlaces = $derived(places.filter((p) => p.lat != null && p.lng != null));
	let hasMap = $derived(mappablePlaces.length > 0);

	let filteredPlaces = $derived(
		places.filter((p) => {
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

	function handleCardClick(placeId: string) {
		if (selectedPlaceId === placeId) {
			const place = places.find(p => p.id === placeId);
			if (place?.note?.trim()) {
				flippedPlaceId = flippedPlaceId === placeId ? null : placeId;
			} else {
				selectedPlaceId = null;
				flippedPlaceId = null;
			}
		} else {
			flippedPlaceId = null;
			selectedPlaceId = placeId;
		}
		recenterTick++;
	}

	function flipToFront(e: MouseEvent) {
		e.stopPropagation();
		flippedPlaceId = null;
	}

	function openLightbox(placeId: string, index: number, e: MouseEvent) {
		e.stopPropagation();
		lightboxPlaceId = placeId;
		lightboxIndex = index;
	}

	function handlePopupPhotoClick(placeId: string, photoIndex: number) {
		lightboxPlaceId = placeId;
		lightboxIndex = photoIndex;
	}

	function closeLightbox() {
		lightboxPlaceId = null;
	}
</script>

<svelte:head>
	<title>{collection.name} — MyPlaces</title>
</svelte:head>

<div class="flex h-[100dvh] flex-col overflow-hidden bg-[#faf7f2]">
	<!-- Map at top -->
	{#if hasMap}
		<div
			class="relative w-full shrink-0 overflow-hidden border-b border-warm-200 bg-warm-100"
			class:shared-map-animate={mapAnimating}
			style="height: {mapHeight}px"
		>
			<div class="h-full w-full">
				<MapView
					places={filteredPlaces}
					{selectedPlaceId}
					{recenterTick}
					onPlaceSelect={handleMapPlaceSelect}
					onPopupPhotoClick={handlePopupPhotoClick}
					{maptilerKey}
					{placePhotos}
					{mapMode}
					{mapHeight}
					{mapDragging}
				/>
			</div>

			<!-- Drag handle -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-x-0 bottom-0 z-10 flex cursor-row-resize touch-none flex-col items-center pb-1 pt-2"
				class:bg-warm-200={mapDragging}
				style="background: {mapDragging ? '' : 'linear-gradient(to top, rgba(255,255,255,0.85), rgba(255,255,255,0.3), transparent)'}"
				onpointerdown={onMapPointerDown}
				onpointermove={onMapPointerMove}
				onpointerup={onMapPointerUp}
				onpointercancel={onMapPointerUp}
				ondblclick={onMapDoubleTap}
			>
				<div class="h-1 w-10 rounded-full {mapDragging ? 'bg-brand-500' : 'bg-warm-400/60'}"></div>
			</div>
		</div>
	{/if}

	<!-- Scrollable content below map -->
	<div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
		<!-- Header: single row — avatar + name | search | count -->
		<div class="sticky top-0 z-20 border-b border-warm-200/80 bg-[#faf7f2] px-3 py-2 sm:px-6">
			<div class="mx-auto max-w-lg flex items-center gap-2.5">
				<div class="flex shrink-0 items-center justify-center">
					<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" decorative={false} />
				</div>
				<h1 class="shrink-0 truncate text-base font-extrabold text-warm-800" style="max-width: 30%">{collection.name}</h1>

				<div class="relative min-w-0 flex-1">
					<svg class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						bind:value={search}
						placeholder="Search..."
						class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-8 pr-8 text-xs font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:text-sm"
					/>
					{#if search}
						<button
							onclick={() => { search = ''; }}
							class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600"
							aria-label="Clear search"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
				</div>

				<span class="shrink-0 text-xs font-semibold text-warm-500">{filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'}</span>
			</div>
		</div>

		<!-- Place cards -->
		<div class="mx-auto max-w-lg px-3 pb-8 pt-2 sm:px-6">
	<!-- Places -->
	{#if filteredPlaces.length === 0}
		<div class="py-16 text-center">
			<p class="text-sm text-warm-500">{search ? 'No places match your search' : 'This collection is empty'}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-2">
			{#each filteredPlaces as place (place.id)}
				{@const isFlipped = flippedPlaceId === place.id}
				{@const isSelected = selectedPlaceId === place.id}
				{@const hasNote = !!place.note?.trim()}
				{@const photos = placePhotos[place.id] ?? []}
				{@const tags = placeTags[place.id] ?? []}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-place-id={place.id}
					class="shared-flip-card [perspective:800px]"
					onclick={() => handleCardClick(place.id)}
				>
					<div
						class="shared-flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
						class:is-flipped={isFlipped}
					>
						<!-- FRONT -->
						<article
							class="flex cursor-pointer flex-col rounded-xl border bg-white px-4 py-3.5 [backface-visibility:hidden] {isSelected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}"
						>
							<!-- Title + Rating -->
							<div class="flex items-start justify-between gap-2">
								<h3 class="min-w-0 flex-1 line-clamp-1 text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>
								{#if place.user_rating}
									<span class="shrink-0 text-base font-extrabold text-warm-700">{place.user_rating.toFixed(1)}<span class="text-brand-500">★</span></span>
								{/if}
							</div>

							<!-- Note preview -->
							{#if hasNote && shareSettings.notes}
								<p class="mt-1 line-clamp-2 text-sm italic leading-snug text-brand-500">
									{place.note?.trim()}
								</p>
							{/if}

							<!-- Bottom row: tags left, menu right -->
							<div class="mt-auto flex items-end justify-between gap-2 pt-3">
								<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
									{#if place.category}
										<span class="rounded-full bg-warm-200 px-2.5 py-0.5 text-xs font-bold text-warm-600">{place.category}</span>
									{/if}
									{#if place.area}
										<span class="rounded-full bg-sage-200 px-2.5 py-0.5 text-xs font-bold text-sage-700">{place.area}</span>
									{/if}
									{#each tags as tag (tag.id)}
										<span
											class="rounded-full px-2.5 py-0.5 text-xs font-bold"
											style="background-color: {tag.color ?? '#6b7280'}; color: {textColorForBg(tag.color ?? '#6b7280')}"
										>{tag.name}</span>
									{/each}
								</div>

								<!-- 3-dot menu -->
								<div class="relative shrink-0">
									<button
										onclick={(e) => { e.stopPropagation(); cardMenuPlaceId = cardMenuPlaceId === place.id ? null : place.id; }}
										class="rounded-md p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500"
										aria-label="More actions"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
											<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
										</svg>
									</button>
									{#if cardMenuPlaceId === place.id}
										<div class="fixed inset-0 z-40" onclick={(e) => { e.stopPropagation(); cardMenuPlaceId = null; }} role="presentation"></div>
										<div class="absolute bottom-full right-0 z-50 mb-1 w-48 rounded-lg border border-warm-200 bg-white py-1 shadow-lg">
											{#if place.url}
												<a
													href={place.url}
													target="_blank"
													onclick={(e) => { e.stopPropagation(); cardMenuPlaceId = null; }}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50"
												>
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
													</svg>
													Open in Map
												</a>
											{/if}
											{#if !isOwner}
												<button
													onclick={(e) => { e.stopPropagation(); cardMenuPlaceId = null; handleSave(); }}
													disabled={saving || saved}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50 disabled:opacity-50"
												>
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
														<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
													</svg>
													{saved ? 'Saved' : 'Save'} to Collection
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</article>

						<!-- BACK (read-only notes) -->
						{#if hasNote}
							<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
								<article
									class="flex h-full cursor-pointer flex-col rounded-xl border bg-white px-4 py-3.5 {isSelected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}"
								>
									<div class="mb-2 flex items-center justify-between">
										<h3 class="line-clamp-1 flex-1 text-base font-extrabold text-warm-800">{place.title}</h3>
										<button
											onclick={flipToFront}
											class="ml-2 shrink-0 rounded-md p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-600"
											aria-label="Flip back"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
											</svg>
										</button>
									</div>
									<div class="flex-1 overflow-y-auto rounded-lg border border-warm-100 bg-warm-50 p-3">
										<p class="whitespace-pre-wrap text-sm leading-relaxed text-warm-700">{place.note?.trim()}</p>
									</div>
								</article>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Footer -->
	<div class="mt-6 pb-4 text-center">
		<p class="text-xs text-warm-300">
			Shared via <a href="/" class="font-semibold text-brand-500 hover:text-brand-600">MyPlaces</a>
		</p>
	</div>
		</div>
	</div>
</div>

<!-- Photo lightbox -->
{#if lightboxPlaceId}
	{@const urls = placePhotos[lightboxPlaceId] ?? []}
	{#if urls.length > 0}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onclick={closeLightbox}>
			<div class="relative max-h-[90dvh] max-w-[90vw]" onclick={(e) => e.stopPropagation()}>
				<img src={urls[lightboxIndex]} alt="" class="max-h-[85dvh] max-w-[85vw] rounded-lg object-contain" />
				<button onclick={closeLightbox} class="absolute -right-2 -top-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80" aria-label="Close lightbox">
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</button>
				{#if urls.length > 1}
					<button
						onclick={() => { lightboxIndex = (lightboxIndex - 1 + urls.length) % urls.length; }}
						class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
						aria-label="Previous photo"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6" /></svg>
					</button>
					<button
						onclick={() => { lightboxIndex = (lightboxIndex + 1) % urls.length; }}
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
						aria-label="Next photo"
					>
						<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
					</button>
					<div class="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
						{lightboxIndex + 1} / {urls.length}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.is-flipped {
		transform: rotateY(180deg);
	}
	.shared-map-animate {
		transition: height 200ms ease-out;
	}
</style>
