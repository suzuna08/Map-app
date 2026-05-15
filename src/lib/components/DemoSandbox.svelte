<script lang="ts">
	import { onMount } from 'svelte';
	import {
		demoPlaces,
		demoTags,
		demoPlaceTags,
		activeTagFilter,
		filteredDemoPlaces,
		addDemoPlace,
		removeDemoPlace,
		addDemoTag,
		togglePlaceTag,
		toggleTagFilter,
		clearTagFilter,
		ensureSuggestedTags,
		resetDemo,
		demoSavedViews,
		addSavedView,
		removeSavedView,
		applySavedView,
		type DemoTag,
	} from '$lib/stores/demo-store';
	import { textColorForBg } from '$lib/tag-colors';
	import MapView from './MapView.svelte';
	import RatingEditor from './RatingEditor.svelte';

	interface Props {
		maptilerKey: string;
	}

	let { maptilerKey }: Props = $props();

	let urlInput = $state('');
	let loading = $state(false);
	let errorMsg = $state('');
	let selectedPlaceId = $state<string | null>(null);
	let recenterTick = $state(0);
	let showNewTagInput = $state(false);
	let newTagName = $state('');
	let tagAssignPlaceId = $state<string | null>(null);
	let mounted = $state(false);
	let mobileOptionsOpen = $state(false);
	let flippedCards = $state<Set<string>>(new Set());
	let noteTexts = $state<Record<string, string>>({});
	let cardMenuId = $state<string | null>(null);
	let bookmarkNameInput = $state('');
	let showBookmarkDialog = $state(false);
	let tagInputValue = $state('');
	let tagInputEl = $state<HTMLInputElement | null>(null);
	let ratingPlaceId = $state<string | null>(null);
	let ratingAnchorRect = $state({ top: 0, left: 0, width: 0, height: 0, bottom: 0 });
	let demoUserRatings = $state<Record<string, number>>({});
	let sectionEl = $state<HTMLElement | null>(null);
	let flipHintPlayed = $state(false);
	let flipHintActive = $state(false);
	let demoPhotos = $state<Record<string, string[]>>({});
	let photoInputPlaceId = $state<string | null>(null);
	let photoFileInput = $state<HTMLInputElement | null>(null);
	let photoViewerUrls = $state<string[]>([]);
	let photoViewerIndex = $state(0);

	const DEMO_LIMIT = 10;
	const DEMO_MAX_PHOTOS_PER_PLACE = 5;
	const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

	function isGoogleMapsUrl(text: string): boolean {
		const t = text.trim();
		return /^https?:\/\/(maps\.google\.|www\.google\.\w+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|share\.google\/)/i.test(t);
	}

	let detectedUrl = $derived(isGoogleMapsUrl(urlInput) ? urlInput.trim() : null);

	let sortedPlaces = $derived([...$filteredDemoPlaces]);

	async function handleAddPlace() {
		if (!detectedUrl || loading) return;
		if ($demoPlaces.length >= DEMO_LIMIT) {
			errorMsg = `Demo limit reached (${DEMO_LIMIT} places). Sign up for unlimited access!`;
			return;
		}
		loading = true;
		errorMsg = '';
		try {
			const res = await fetch('/api/demo/resolve-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: detectedUrl }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message || `Error ${res.status}`);
			}
			const data = await res.json();
			if ($demoPlaces.some((p) => p.google_place_id === data.place.google_place_id)) {
				errorMsg = 'This place is already added';
				return;
			}
			const isFirst = $demoPlaces.length === 0;
			addDemoPlace(data.place);
			if (data.suggestedTags?.length) {
				ensureSuggestedTags(data.suggestedTags.slice(0, 3));
			}
			urlInput = '';
			selectedPlaceId = data.place.id;
			recenterTick++;
			if (isFirst && !flipHintPlayed) {
				flipHintPlayed = true;
				setTimeout(() => { flipHintActive = true; }, 800);
				setTimeout(() => { flipHintActive = false; }, 2000);
			}
		} catch (e: any) {
			errorMsg = e.message || 'Something went wrong';
		} finally {
			loading = false;
		}
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && detectedUrl) { e.preventDefault(); handleAddPlace(); }
	}

	function handleCardClick(placeId: string, e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea, [role="button"]')) return;
		if (selectedPlaceId === placeId) {
			const next = new Set(flippedCards);
			if (next.has(placeId)) next.delete(placeId);
			else next.add(placeId);
			flippedCards = next;
		} else {
			selectedPlaceId = placeId;
			recenterTick++;
		}
	}

	function handleMapPlaceSelect(placeId: string) {
		selectedPlaceId = placeId;
	}

	function flipToFront(placeId: string) {
		const next = new Set(flippedCards);
		next.delete(placeId);
		flippedCards = next;
	}

	function handleCreateTag() {
		const name = newTagName.trim();
		if (!name) return;
		if ($demoTags.find((t) => t.name.toLowerCase() === name.toLowerCase())) return;
		addDemoTag(name);
		newTagName = '';
		showNewTagInput = false;
	}

	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); }
		if (e.key === 'Escape') { showNewTagInput = false; newTagName = ''; }
	}

	let tagSuggestions = $derived.by(() => {
		if (!tagAssignPlaceId) return [];
		const assignedIds = $demoPlaceTags[tagAssignPlaceId] ?? [];
		const available = $demoTags.filter((t) => !assignedIds.includes(t.id));
		if (!tagInputValue.trim()) return available;
		const q = tagInputValue.trim().toLowerCase();
		return available.filter((t) => t.name.toLowerCase().includes(q));
	});

	let tagInputShowCreate = $derived(
		tagInputValue.trim().length > 0 &&
		!$demoTags.some((t) => t.name.toLowerCase() === tagInputValue.trim().toLowerCase())
	);

	function openTagInput(placeId: string) {
		tagAssignPlaceId = tagAssignPlaceId === placeId ? null : placeId;
		tagInputValue = '';
		if (tagAssignPlaceId) {
			requestAnimationFrame(() => tagInputEl?.focus());
		}
	}

	function handleTagInputKeydown(e: KeyboardEvent) {
		if (!tagAssignPlaceId) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			if (tagSuggestions.length > 0) {
				togglePlaceTag(tagAssignPlaceId, tagSuggestions[0].id);
				tagInputValue = '';
			} else if (tagInputShowCreate) {
				const newTag = addDemoTag(tagInputValue.trim());
				togglePlaceTag(tagAssignPlaceId, newTag.id);
				tagInputValue = '';
			}
		} else if (e.key === 'Escape') {
			tagAssignPlaceId = null;
			tagInputValue = '';
		}
	}

	function handleTagSuggestionClick(tagId: string) {
		if (!tagAssignPlaceId) return;
		togglePlaceTag(tagAssignPlaceId, tagId);
		tagInputValue = '';
	}

	function handleCreateTagFromInput() {
		if (!tagAssignPlaceId || !tagInputValue.trim()) return;
		const newTag = addDemoTag(tagInputValue.trim());
		togglePlaceTag(tagAssignPlaceId, newTag.id);
		tagInputValue = '';
	}

	function openRatingEditor(placeId: string, e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		ratingAnchorRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom };
		ratingPlaceId = placeId;
	}

	function saveDemoRating(rating: number) {
		if (!ratingPlaceId) return;
		demoUserRatings = { ...demoUserRatings, [ratingPlaceId]: rating };
		ratingPlaceId = null;
	}

	function clearDemoRating() {
		if (!ratingPlaceId) return;
		const next = { ...demoUserRatings };
		delete next[ratingPlaceId];
		demoUserRatings = next;
		ratingPlaceId = null;
	}

	function triggerPhotoUpload(placeId: string) {
		photoInputPlaceId = placeId;
		photoFileInput?.click();
	}

	function handlePhotoFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files?.length || !photoInputPlaceId) return;
		const existing = demoPhotos[photoInputPlaceId] ?? [];
		const remaining = DEMO_MAX_PHOTOS_PER_PLACE - existing.length;
		if (remaining <= 0) return;

		const newUrls: string[] = [];
		for (let i = 0; i < Math.min(files.length, remaining); i++) {
			const file = files[i];
			if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
			newUrls.push(URL.createObjectURL(file));
		}
		demoPhotos = { ...demoPhotos, [photoInputPlaceId]: [...existing, ...newUrls] };
		input.value = '';
		photoInputPlaceId = null;
	}

	function removeDemoPhoto(placeId: string, index: number) {
		const photos = demoPhotos[placeId] ?? [];
		URL.revokeObjectURL(photos[index]);
		demoPhotos = { ...demoPhotos, [placeId]: photos.filter((_, i) => i !== index) };
	}

	function openPhotoViewer(placeId: string, index: number) {
		photoViewerUrls = demoPhotos[placeId] ?? [];
		photoViewerIndex = index;
	}

	function closePhotoViewer() {
		photoViewerUrls = [];
		photoViewerIndex = 0;
	}

	function getPlaceTags(placeId: string): DemoTag[] {
		const tagIds = $demoPlaceTags[placeId] ?? [];
		return $demoTags.filter((t) => tagIds.includes(t.id));
	}

	function handleSaveBookmark() {
		const name = bookmarkNameInput.trim();
		if (!name || $activeTagFilter.size === 0) return;
		addSavedView(name, [...$activeTagFilter]);
		bookmarkNameInput = '';
		showBookmarkDialog = false;
	}

	function handleBookmarkKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); handleSaveBookmark(); }
		if (e.key === 'Escape') { showBookmarkDialog = false; bookmarkNameInput = ''; }
	}

	$effect(() => {
		if (selectedPlaceId && !sortedPlaces.some((p) => p.id === selectedPlaceId)) {
			selectedPlaceId = null;
		}
	});

	onMount(() => {
		mounted = true;

		if (!sectionEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !flipHintPlayed && sortedPlaces.length > 0) {
					flipHintPlayed = true;
					flipHintActive = true;
					setTimeout(() => { flipHintActive = false; }, 1200);
				}
			},
			{ threshold: 0.3 }
		);
		observer.observe(sectionEl);
		return () => observer.disconnect();
	});
</script>

<style>
	.is-flipped { transform: rotateY(180deg); }

	@keyframes flip-hint {
		0%   { transform: rotateY(0deg); }
		40%  { transform: rotateY(-35deg); }
		70%  { transform: rotateY(-15deg); }
		100% { transform: rotateY(0deg); }
	}
	.flip-hint-active {
		animation: flip-hint 1.2s ease-in-out;
	}
</style>

<section bind:this={sectionEl} class="mt-16 w-full max-w-6xl px-4">
	<div class="mb-5 text-center">
		<h2 class="mb-2 text-2xl font-extrabold tracking-tight text-warm-800">Try it now</h2>
		<p class="mx-auto max-w-lg text-sm leading-relaxed text-warm-500">
			Paste a Google Maps URL below to see it on the map. Add tags, filter, click a card to flip for notes — no account needed.
		</p>
	</div>

	<div class="overflow-hidden rounded-2xl border border-warm-200 bg-sage-100 text-left shadow-sm" style="min-height: 560px;">
		<!-- ========== MOBILE layout (< lg) ========== -->
		<div class="flex flex-col lg:hidden" style="height: 80vh; max-height: 700px;">
			<div class="relative h-[35%] shrink-0 border-b border-warm-200">
				{#if mounted}
					<MapView
						places={sortedPlaces}
						{selectedPlaceId}
						{recenterTick}
						onPlaceSelect={handleMapPlaceSelect}
						{maptilerKey}
						mapMode="default"
					/>
				{/if}
				<div class="absolute bottom-0 left-0 right-0 flex justify-center pb-1.5 pt-1">
					<div class="h-1 w-8 rounded-full bg-warm-300/60"></div>
				</div>
			</div>
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div class="shrink-0 border-b border-warm-200/80 bg-sage-100 px-2.5 pb-1.5 pt-2">
					{@render filterSummary()}
					{@render tagRow()}
					{@render savedViewsRow()}
					{@render searchBar()}
				</div>
				<div class="flex-1 overflow-y-auto px-2.5 py-2">
					{@render cardGrid()}
				</div>
				{@render footerBar()}
			</div>
		</div>

		<!-- ========== DESKTOP layout (>= lg) ========== -->
		<div class="hidden lg:flex lg:flex-row" style="min-height: 560px;">
			<div class="flex min-w-0 flex-1 flex-col" style="container-type: inline-size;">
				<div class="sticky top-0 z-20 border-b border-warm-200/80 bg-sage-100 px-4 pb-2 pt-3">
					{@render filterSummary()}
					{@render tagRow()}
					{@render savedViewsRow()}
					{@render searchBar()}
				</div>
				<div class="flex-1 overflow-y-auto px-4 py-3" style="max-height: 440px;">
					{@render cardGrid()}
				</div>
				{@render footerBar()}
			</div>
			<div class="w-[42%] border-l border-warm-200" style="min-height: 560px;">
				{#if mounted}
					<MapView
						places={sortedPlaces}
						{selectedPlaceId}
						{recenterTick}
						onPlaceSelect={handleMapPlaceSelect}
						{maptilerKey}
						mapMode="default"
					/>
				{/if}
			</div>
		</div>
	</div>

	{#if $demoPlaces.length >= 2}
		<div class="mt-6 text-center">
			<p class="mb-3 text-sm text-warm-500">Like it? Sign up to save your places permanently.</p>
			<a href="/login" class="inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md">
				Get Started — It's Free
			</a>
		</div>
	{/if}

	{#if ratingPlaceId}
		<RatingEditor
			value={demoUserRatings[ratingPlaceId] ?? null}
			anchorRect={ratingAnchorRect}
			onSave={saveDemoRating}
			onClear={clearDemoRating}
			onClose={() => { ratingPlaceId = null; }}
		/>
	{/if}

	<!-- Hidden file input for photo upload -->
	<input
		bind:this={photoFileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp"
		multiple
		class="hidden"
		onchange={handlePhotoFiles}
	/>

	<!-- Photo viewer overlay -->
	{#if photoViewerUrls.length > 0}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onclick={closePhotoViewer}>
			<button onclick={closePhotoViewer} class="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30" aria-label="Close viewer">
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
			{#if photoViewerUrls.length > 1}
				<button onclick={(e) => { e.stopPropagation(); photoViewerIndex = (photoViewerIndex - 1 + photoViewerUrls.length) % photoViewerUrls.length; }}
					class="absolute left-4 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30" aria-label="Previous photo">
					<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
				</button>
				<button onclick={(e) => { e.stopPropagation(); photoViewerIndex = (photoViewerIndex + 1) % photoViewerUrls.length; }}
					class="absolute right-14 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30" aria-label="Next photo">
					<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
				</button>
			{/if}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div onclick={(e) => e.stopPropagation()} class="max-h-[80vh] max-w-[90vw]">
				<img src={photoViewerUrls[photoViewerIndex]} alt="Photo {photoViewerIndex + 1}" class="max-h-[80vh] max-w-[90vw] rounded-lg object-contain" />
			</div>
			{#if photoViewerUrls.length > 1}
				<span class="absolute bottom-4 rounded-full bg-white/20 px-3 py-1 text-sm text-white">{photoViewerIndex + 1} / {photoViewerUrls.length}</span>
			{/if}
		</div>
	{/if}
</section>

<!-- ==================== SNIPPETS ==================== -->

{#snippet tagRow()}
	{#if $demoTags.length > 0}
		<div class="mb-1.5">
			<div class="flex items-center gap-2.5">
				<span class="hidden shrink-0 text-sm font-bold text-warm-400 lg:inline" style="width: 3rem">Tags</span>
				<div class="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{#each $demoTags as tag (tag.id)}
						{@const isSelected = $activeTagFilter.has(tag.id)}
						<button
							onclick={() => toggleTagFilter(tag.id)}
							class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all sm:text-sm {isSelected ? 'shadow-sm ring-2 ring-offset-1' : 'opacity-80 hover:opacity-100'}"
							style="background-color: {tag.color}; color: {textColorForBg(tag.color)}; {isSelected ? `ring-color: ${tag.color}` : ''}"
						>
							{tag.name}
							{#if isSelected}
								<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							{/if}
						</button>
					{/each}
					<button
						onclick={() => { showNewTagInput = !showNewTagInput; }}
						class="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-warm-300 px-2 py-0.5 text-xs text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600 sm:text-sm"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						Add tag
					</button>
				</div>
			</div>
			{#if showNewTagInput}
				<div class="mt-1.5 flex items-center gap-2 pl-0 lg:pl-[3.75rem]">
					<input type="text" bind:value={newTagName} onkeydown={handleTagKeydown} placeholder="Tag name..."
						class="w-32 rounded-full border border-warm-200 bg-warm-50 px-3 py-1 text-xs text-warm-700 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-500/20 sm:text-sm" />
					<button onclick={handleCreateTag} class="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white hover:bg-brand-700">Create</button>
					<button onclick={() => { showNewTagInput = false; newTagName = ''; }} class="text-xs text-warm-400 hover:text-warm-600">Cancel</button>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet savedViewsRow()}
	{#if $demoSavedViews.length > 0}
		<div class="mb-1.5">
			<div class="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{#each $demoSavedViews as view (view.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						onclick={() => applySavedView(view)}
						class="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-warm-200 bg-white px-2 py-1 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-50 sm:text-sm"
					>
						<svg class="h-3 w-3 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
						</svg>
						{view.name}
						<button onclick={(e) => { e.stopPropagation(); removeSavedView(view.id); }}
							class="hidden rounded p-0.5 text-warm-300 hover:text-warm-500 group-hover:inline-flex" aria-label="Remove saved view">
							<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
								<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet filterSummary()}
	{#if $activeTagFilter.size > 0}
		<div class="mb-1.5 min-h-[28px] sm:min-h-[32px]">
			<div class="flex min-w-0 items-center gap-2 lg:gap-2.5">
				<span class="hidden shrink-0 text-sm font-bold text-warm-400 lg:inline" style="width: 3rem">Filter</span>
				<div class="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<span class="shrink-0 text-xs font-bold text-warm-400 sm:text-sm lg:hidden">Filtered:</span>
					{#each [...$activeTagFilter] as tagId (tagId)}
						{@const tag = $demoTags.find((t) => t.id === tagId)}
						{#if tag}
							<button
								onclick={() => toggleTagFilter(tagId)}
								class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:px-2.5 sm:text-sm"
								style="background-color: {tag.color}; color: {textColorForBg(tag.color)}"
							>
								{tag.name}
								<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						{/if}
					{/each}
				</div>
				<button onclick={() => clearTagFilter()} class="shrink-0 whitespace-nowrap text-xs font-medium text-warm-400 transition-colors hover:text-warm-600 sm:text-sm">Clear</button>
			</div>
		</div>
	{/if}
{/snippet}

{#snippet searchBar()}
	<div class="flex items-center gap-2">
		<div class="relative min-w-0 flex-1">
			<input type="text" bind:value={urlInput} onkeydown={handleSearchKeydown}
				placeholder="Search places, tags, or paste a Google Maps URL"
				disabled={loading}
				class="w-full rounded-full border border-warm-200 bg-warm-50 py-1.5 pl-3.5 pr-10 text-sm font-medium text-warm-800 placeholder:text-warm-400 transition-all focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 disabled:opacity-60 sm:py-2 sm:pl-4" />
			{#if loading}
				<svg class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			{:else if detectedUrl}
				<button onclick={handleAddPlace} disabled={$demoPlaces.length >= DEMO_LIMIT}
					class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50"
					aria-label="Add place">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
					</svg>
				</button>
			{:else if urlInput}
				<button onclick={() => { urlInput = ''; }} class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600" aria-label="Clear">
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			{/if}
		</div>
		<!-- Bookmark button -->
		<div class="relative">
			<button onclick={() => { if ($activeTagFilter.size > 0) showBookmarkDialog = !showBookmarkDialog; }}
				class="flex items-center gap-1 rounded-lg border border-warm-200 bg-white px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm {$activeTagFilter.size > 0 ? 'text-warm-600 hover:bg-warm-50' : 'text-warm-300 cursor-default'}"
				aria-label="Save current filter as bookmark"
				disabled={$activeTagFilter.size === 0}>
				<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
				</svg>
				<span class="hidden sm:inline">Bookmark</span>
			</button>
			{#if showBookmarkDialog}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => { showBookmarkDialog = false; bookmarkNameInput = ''; }}></div>
				<div class="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-warm-200 bg-white p-3 shadow-lg">
					<p class="mb-2 text-xs font-semibold text-warm-500">Save current filter</p>
					<input type="text" bind:value={bookmarkNameInput} onkeydown={handleBookmarkKeydown}
						placeholder="View name..."
						class="mb-2 w-full rounded-md border border-warm-200 px-2.5 py-1.5 text-xs text-warm-700 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/20" />
					<button onclick={handleSaveBookmark} disabled={!bookmarkNameInput.trim()}
						class="w-full rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">
						Save Bookmark
					</button>
				</div>
			{/if}
		</div>
		<!-- Sort/filter button -->
		<div class="relative">
			<button onclick={() => { mobileOptionsOpen = !mobileOptionsOpen; }}
				class="flex items-center justify-center rounded-lg border border-warm-200 bg-white p-1.5 text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-600 sm:px-2 sm:py-1.5"
				aria-label="Sort and view options">
				<svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
					<circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="14" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" />
				</svg>
			</button>
			{#if mobileOptionsOpen}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => { mobileOptionsOpen = false; }}></div>
				<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white p-2 shadow-lg">
					<p class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-warm-400">Demo mode</p>
					<p class="px-2 py-1 text-xs text-warm-500">Click a card to select, click again to flip and write notes.</p>
				</div>
			{/if}
		</div>
	</div>
	{#if errorMsg}
		<p class="mt-1.5 text-xs text-red-600">{errorMsg}</p>
	{/if}
{/snippet}

{#snippet cardGrid()}
	{#if sortedPlaces.length === 0 && !loading}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
			</svg>
			<p class="mt-3 text-sm text-warm-500">No places yet</p>
			<p class="mt-1 text-xs text-warm-400">Paste a Google Maps link above to get started</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-2 @lg:grid-cols-2 @lg:gap-3">
		{#each sortedPlaces as place, idx (place.id)}
			{@const placeTags = getPlaceTags(place.id)}
			{@const isFlipped = flippedCards.has(place.id)}
			{@const isSelected = selectedPlaceId === place.id}
			{@const noteText = noteTexts[place.id] ?? ''}

			<div>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="[perspective:800px] lg:[perspective:1000px] {cardMenuId === place.id ? 'relative z-10' : ''}" data-place-id={place.id}
				onclick={(e) => handleCardClick(place.id, e)}>
				<div class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d] {idx === 0 && flipHintActive && !isFlipped ? 'flip-hint-active' : ''}"
					class:is-flipped={isFlipped}>

						<!-- FRONT FACE -->
						<div class="[backface-visibility:hidden]">
							<article class="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white p-3 transition-all hover:shadow-md hover:shadow-warm-200/50 sm:rounded-2xl sm:p-4 h-[148px] lg:h-[170px] {isSelected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}">
								<!-- Title row -->
								<div class="mb-0.5 flex items-center justify-between gap-2">
									<h3 class="min-w-0 flex-1 line-clamp-1 text-[15px] font-extrabold leading-snug text-warm-800 sm:text-base sm:tracking-tight">{place.title}</h3>
									<div class="flex shrink-0 items-center gap-0.5">
										{#if demoUserRatings[place.id] != null}
											<span class="shrink-0 rounded-md px-1 py-0.5 text-sm font-medium text-warm-700">{demoUserRatings[place.id].toFixed(1)}<span class="text-brand-500">★</span></span>
										{:else if place.rating}
											<span class="shrink-0 rounded-md px-1 py-0.5 text-sm font-medium text-warm-700">{place.rating}<span class="text-brand-500">★</span></span>
										{/if}
										<div class="relative">
											<button onclick={(e) => { e.stopPropagation(); cardMenuId = cardMenuId === place.id ? null : place.id; }}
												class="rounded-md p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500" aria-label="More actions">
												<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
													<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
												</svg>
											</button>
											{#if cardMenuId === place.id}
												<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
												<div class="fixed inset-0 z-40" onclick={(e) => { e.stopPropagation(); cardMenuId = null; }}></div>
												<div class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-warm-200 bg-white py-1 shadow-lg">
													{#if place.url}
														<a href={place.url} target="_blank" rel="noopener noreferrer"
															onclick={(e) => { e.stopPropagation(); cardMenuId = null; }}
															class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50">
															<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
															</svg>
															Open in Map
														</a>
													{/if}
													<button onclick={(e) => { e.stopPropagation(); cardMenuId = null; triggerPhotoUpload(place.id); }}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50">
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
													</svg>
													Add Photo{#if (demoPhotos[place.id]?.length ?? 0) > 0}<span class="ml-auto text-xs text-warm-400">{demoPhotos[place.id].length}/{DEMO_MAX_PHOTOS_PER_PLACE}</span>{/if}
												</button>
												<button onclick={(e) => { e.stopPropagation(); cardMenuId = null; openRatingEditor(place.id, e); }}
														class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50">
														<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
															<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
														</svg>
														{demoUserRatings[place.id] != null ? `${demoUserRatings[place.id].toFixed(1)} ★` : 'Rate'}
													</button>
													<button onclick={(e) => { e.stopPropagation(); cardMenuId = null; }}
														class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50">
														<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
															<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
															<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
														</svg>
														Add to Collection
													</button>
													{#if place.category || place.area}
														<button onclick={(e) => { e.stopPropagation(); cardMenuId = null; const candidates = [place.category, place.area].filter(Boolean); ensureSuggestedTags(candidates as string[]); const allTags = $demoTags; const matchingIds = allTags.filter((t) => candidates.includes(t.name)).map((t) => t.id); for (const tid of matchingIds) { if (!($demoPlaceTags[place.id] ?? []).includes(tid)) togglePlaceTag(place.id, tid); } }}
															class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50">
															<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
																<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
															</svg>
															Auto Tag
														</button>
													{/if}
													<button onclick={(e) => { e.stopPropagation(); cardMenuId = null; removeDemoPlace(place.id); }}
														class="flex w-full items-center gap-2.5 border-t border-warm-100 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50">
														<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
															<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
														</svg>
														Delete
													</button>
												</div>
											{/if}
										</div>
									</div>
								</div>

								<!-- Photos strip -->
								{#if (demoPhotos[place.id]?.length ?? 0) > 0}
									<div class="mt-1 flex gap-1 overflow-x-auto" style="-webkit-overflow-scrolling: touch; scrollbar-width: none;">
										{#each demoPhotos[place.id] as photoUrl, pi}
											<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
											<div class="group/photo relative shrink-0" onclick={(e) => { e.stopPropagation(); openPhotoViewer(place.id, pi); }}>
												<img src={photoUrl} alt="Photo {pi + 1}" class="h-12 w-12 rounded-md object-cover sm:h-14 sm:w-14" />
												<button onclick={(e) => { e.stopPropagation(); removeDemoPhoto(place.id, pi); }}
													class="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-warm-700/80 text-white group-hover/photo:flex"
													aria-label="Remove photo">
													<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
												</button>
											</div>
										{/each}
									</div>
								{/if}
								<!-- Middle: note preview or description -->
								<div class="min-h-0 flex-1">
									{#if noteText}
										<p class="mt-0.5 line-clamp-2 text-[13px] italic leading-snug text-brand-500 sm:text-sm">{noteText}</p>
									{:else if place.description}
										<p class="mt-0.5 line-clamp-2 text-[13px] leading-snug text-warm-400 sm:text-sm">{place.description}</p>
									{/if}
								</div>

								<!-- Bottom: tags + actions -->
								<div class="flex items-end gap-1">
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-1">
											{#each placeTags as tag (tag.id)}
												<span class="inline-flex items-center gap-0.5 rounded-full text-[10px] font-bold sm:text-xs"
													style="background-color: {tag.color}; color: {textColorForBg(tag.color)};">
													<button onclick={(e) => { e.stopPropagation(); toggleTagFilter(tag.id); }}
														class="py-0.5 pl-2 transition-opacity hover:opacity-80">
														{tag.name}
													</button>
													<button onclick={(e) => { e.stopPropagation(); togglePlaceTag(place.id, tag.id); }}
														class="rounded-full p-0.5 pr-1.5 opacity-60 transition-opacity hover:opacity-100"
														aria-label="Remove tag {tag.name}">
														<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
															<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
														</svg>
													</button>
												</span>
											{/each}
											{#if tagAssignPlaceId === place.id}
												<div class="relative">
													<input
														bind:this={tagInputEl}
														bind:value={tagInputValue}
														onkeydown={handleTagInputKeydown}
														onblur={() => { setTimeout(() => { tagAssignPlaceId = null; tagInputValue = ''; }, 180); }}
														onclick={(e) => e.stopPropagation()}
														placeholder="tag name..."
														class="w-24 rounded-full border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs text-warm-700 placeholder-warm-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 sm:w-28"
													/>
												</div>
											{:else}
												<button onclick={(e) => { e.stopPropagation(); openTagInput(place.id); }}
													class="inline-flex items-center justify-center rounded-full border border-dashed border-warm-300 px-2 py-0.5 text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-500 sm:px-2.5"
													aria-label="Add tag">
													<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
														<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
													</svg>
												</button>
											{/if}
										</div>
									</div>
									<button onclick={(e) => { e.stopPropagation(); removeDemoPlace(place.id); }}
										class="shrink-0 rounded-md p-1 text-warm-300 transition-colors hover:text-danger-400" aria-label="Delete place">
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									</button>
								</div>
							</article>
						</div>

						<!-- BACK FACE (Notes) -->
						<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
							<article class="flex cursor-pointer flex-col rounded-xl border border-warm-200 bg-white p-3 sm:rounded-2xl sm:p-4 h-[148px] lg:h-[170px]">
								<div class="mb-1 flex items-center justify-between">
									<h3 class="min-w-0 flex-1 truncate text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>
									<button onclick={(e) => { e.stopPropagation(); flipToFront(place.id); }}
										class="shrink-0 rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600" aria-label="Flip back">
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
										</svg>
									</button>
								</div>
								<textarea
									bind:value={noteTexts[place.id]}
									onclick={(e) => e.stopPropagation()}
									placeholder="Write your notes here... (demo only)"
									class="flex-1 w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-stone-500 placeholder:text-warm-300/70 placeholder:italic focus:outline-none"
								></textarea>
							</article>
						</div>
					</div>
				</div>
				{#if idx === 0 && flipHintActive}
					<p class="mt-1 text-center text-xs font-medium text-warm-400 animate-pulse">Click card to flip & add notes</p>
				{/if}

				<!-- Tag suggestion dropdown (floating, like prod) -->
				{#if tagAssignPlaceId === place.id && (tagSuggestions.length > 0 || tagInputShowCreate)}
					<div class="relative z-50 mt-1 w-48 max-h-52 overflow-y-auto overscroll-contain rounded-lg border border-warm-200 bg-white py-1 shadow-xl">
						{#each tagSuggestions as tag (tag.id)}
							<button
								onmousedown={(e) => { e.preventDefault(); handleTagSuggestionClick(tag.id); }}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-warm-50"
							>
								<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {tag.color}"></span>
								{tag.name}
							</button>
						{/each}
						{#if tagInputShowCreate}
							<button
								onmousedown={(e) => { e.preventDefault(); handleCreateTagFromInput(); }}
								class="flex w-full items-center gap-2 border-t border-warm-100 px-3 py-1.5 text-left text-sm text-brand-600 hover:bg-brand-50"
							>
								<svg class="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
								</svg>
								Create "{tagInputValue.trim()}"
							</button>
						{/if}
					</div>
				{/if}
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet footerBar()}
	<div class="shrink-0 border-t border-warm-200/80 bg-sage-100 px-3 py-2 sm:px-4">
		<div class="flex items-center justify-between text-xs text-warm-400">
			<span>{sortedPlaces.length} place{sortedPlaces.length !== 1 ? 's' : ''} · {$demoPlaces.length}/{DEMO_LIMIT} demo limit</span>
			{#if $demoPlaces.length > 0}
				<button onclick={() => resetDemo()} class="text-warm-500 underline decoration-warm-300 transition-colors hover:text-warm-700">Reset</button>
			{/if}
		</div>
	</div>
{/snippet}
