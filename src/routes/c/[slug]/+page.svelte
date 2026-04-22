<script lang="ts">
	import type { Collection, Place } from '$lib/types/database';
	import type { Session } from '@supabase/supabase-js';
	import MapView from '$lib/components/MapView.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();
	let collection = (data as any).collection as Collection;
	let places = (data as any).places as Place[];
	let maptilerKey: string = data.maptilerKey ?? '';
	let session: Session | null = (data as any).session ?? null;

	let viewMode = $state<'grid' | 'list'>('grid');
	let search = $state('');
	let selectedPlaceId = $state<string | null>(null);
	let flippedPlaceId = $state<string | null>(null);
	let mapExpanded = $state(true);
	let saving = $state(false);
	let saved = $state(false);

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
			const els = document.querySelectorAll(`[data-place-id="${placeId}"]`);
			for (const el of els) {
				if (el instanceof HTMLElement && el.offsetParent !== null) {
					el.scrollIntoView({ behavior: 'smooth', block: 'center' });
					break;
				}
			}
		});
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
	}

	function flipToFront(e: MouseEvent) {
		e.stopPropagation();
		flippedPlaceId = null;
	}
</script>

<svelte:head>
	<title>{collection.name} — MapOrganizer</title>
</svelte:head>

<!-- Sticky top panel: header + map (matches collection detail layout) -->
<div class="sticky top-0 z-10 border-b border-warm-200/80 bg-[#faf7f2] shadow-sm">
	<div class="mx-auto max-w-4xl px-3 sm:px-6">
		<!-- Header -->
		<div class="pb-2 pt-3 sm:pb-2.5 sm:pt-4">
			<div class="flex items-center justify-between gap-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2.5">
						<div class="flex shrink-0 items-center justify-center">
							<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" decorative={false} />
						</div>
						<div class="min-w-0 flex-1">
							<h1 class="truncate text-base font-extrabold text-warm-800 sm:text-lg">{collection.name}</h1>
							{#if collection.description}
								<p class="mt-0.5 text-xs text-warm-400 sm:text-sm">{collection.description}</p>
							{/if}
						</div>
					</div>
				</div>
			<button
				onclick={handleSave}
				disabled={saving || saved || isOwner}
				class="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors sm:text-sm {saved ? 'bg-sage-200 text-sage-700' : isOwner ? 'bg-warm-200 text-warm-400 cursor-not-allowed' : 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700'} disabled:opacity-60"
				title={isOwner ? 'This is your collection' : 'Save to your collections'}
			>
				{#if saving}
					<svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83" />
					</svg>
					Saving…
				{:else if saved}
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					Saved
				{:else}
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
					</svg>
					Save
				{/if}
			</button>
			</div>
		</div>
	</div>

	<!-- Map (inside sticky panel) -->
	{#if hasMap}
		<div class="mx-auto max-w-4xl px-3 pb-2 sm:px-6 sm:pb-2.5">
			<div class="overflow-hidden rounded-xl border border-warm-200 sm:rounded-2xl">
				<button
					onclick={() => { mapExpanded = !mapExpanded; }}
					class="flex w-full items-center justify-between bg-white px-3 py-1.5 text-xs font-semibold text-warm-500 transition-colors hover:bg-warm-50 sm:px-4 sm:py-2"
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
		<p class="text-xs font-semibold text-warm-500 sm:text-base">{filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'}</p>
		<div class="flex items-center gap-1.5 sm:gap-2">
			<div class="relative">
				<svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="text"
					bind:value={search}
					placeholder="Search..."
					class="w-28 rounded-lg border border-warm-200 bg-warm-50 py-1 pl-7 pr-7 text-xs font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:w-40 sm:text-sm"
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
	{#if filteredPlaces.length === 0}
		<div class="py-16 text-center">
			<p class="text-sm text-warm-500">{search ? 'No places match your search' : 'This collection is empty'}</p>
		</div>
	{:else if viewMode === 'grid'}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
			{#each filteredPlaces as place (place.id)}
				{@const isFlipped = flippedPlaceId === place.id}
				{@const isSelected = selectedPlaceId === place.id}
				{@const hasNote = !!place.note?.trim()}
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
							class="flex h-[190px] cursor-pointer flex-col rounded-xl border bg-white p-3 [backface-visibility:hidden] sm:h-[240px] sm:rounded-2xl sm:p-5 {isSelected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}"
						>
							<div class="mb-2 flex items-center justify-between sm:mb-3">
								<div class="flex flex-wrap items-center gap-1.5">
									{#if place.category}
									<span class="rounded-full bg-warm-200 px-2 py-0.5 text-xs font-bold text-warm-600">{place.category}</span>
								{/if}
								{#if place.area}
									<span class="rounded-full bg-sage-200 px-2 py-0.5 text-xs font-bold text-sage-700">{place.area}</span>
								{/if}
								{#if place.price_level}
									<span class="text-xs font-bold text-brand-600">{place.price_level}</span>
									{/if}
								</div>
								{#if place.user_rating}
									<span class="text-xs font-extrabold text-warm-700 sm:text-sm">{place.user_rating.toFixed(1)}<span class="text-brand-500">★</span></span>
								{/if}
							</div>

							<h3 class="mb-1 line-clamp-1 text-sm font-extrabold leading-snug text-warm-800 sm:text-lg">{place.title}</h3>

							<div class="min-h-0 flex-1">
								{#if hasNote}
									<p class="line-clamp-2 text-xs font-medium italic leading-[1.4em] text-brand-500 sm:text-sm">
										{place.note?.trim()}
									</p>
								{/if}
							</div>

							<div class="mt-auto flex items-center gap-1 pt-2 sm:pt-2.5">
								{#if place.url}
									<a
										href={place.url}
										target="_blank"
										class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
										onclick={(e) => e.stopPropagation()}
									>
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
										</svg>
										Maps
									</a>
								{/if}
								{#if hasNote}
									<span class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-300">
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
										</svg>
										Tap for notes
									</span>
								{/if}
							</div>
						</article>

						<!-- BACK (read-only notes) -->
						{#if hasNote}
							<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
								<article
									class="flex h-[190px] cursor-pointer flex-col rounded-xl border bg-white p-3 sm:h-[240px] sm:rounded-2xl sm:p-5 {isSelected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}"
								>
									<div class="mb-2 flex items-center justify-between">
										<h3 class="line-clamp-1 flex-1 text-sm font-extrabold text-warm-800 sm:text-lg">{place.title}</h3>
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
									<div class="flex-1 overflow-y-auto rounded-lg border border-warm-100 bg-warm-50 p-2.5 sm:p-3">
										<p class="whitespace-pre-wrap text-xs leading-relaxed text-warm-700 sm:text-sm">{place.note?.trim()}</p>
									</div>
									<div class="mt-auto flex items-center gap-1 pt-2 sm:pt-2.5">
										{#if place.url}
											<a
												href={place.url}
												target="_blank"
												class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
												onclick={(e) => e.stopPropagation()}
											>
												<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
												</svg>
												Maps
											</a>
										{/if}
									</div>
								</article>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border border-warm-200 bg-white divide-y divide-warm-100 sm:rounded-2xl">
			{#each filteredPlaces as place (place.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					data-place-id={place.id}
					class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors {selectedPlaceId === place.id ? 'bg-brand-50/70' : 'hover:bg-warm-50'}"
					onclick={() => handleCardClick(place.id)}
				>
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-sm font-bold text-warm-800">{place.title}</h3>
						<div class="mt-0.5 flex items-center gap-1.5">
							<span class="shrink-0 text-xs text-warm-400">
								{#if place.area && place.category}
									{place.area} · {place.category}
								{:else if place.area}
									{place.area}
								{:else if place.category}
									{place.category}
								{/if}
							</span>
						</div>
					</div>
					{#if place.user_rating}
						<span class="shrink-0 text-xs font-bold"><span class="text-brand-500">★</span> {place.user_rating.toFixed(1)}</span>
					{/if}
					<div class="flex shrink-0 items-center gap-1">
						{#if place.url}
							<a href={place.url} target="_blank" class="rounded p-1 text-warm-300 hover:text-warm-600" aria-label="Maps" onclick={(e) => e.stopPropagation()}>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
								</svg>
							</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Footer -->
	<div class="mt-6 text-center">
		<p class="text-xs text-warm-300">
			Shared via <a href="/" class="font-semibold text-brand-500 hover:text-brand-600">MapOrganizer</a>
		</p>
	</div>
</div>

<style>
	.is-flipped {
		transform: rotateY(180deg);
	}
</style>
