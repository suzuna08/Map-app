<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Place, Tag, Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import TagInput from './TagInput.svelte';
	import AddToCollectionModal from './AddToCollectionModal.svelte';
	import RatingDisplay from './RatingDisplay.svelte';
	import PlaceActionMenu from './PlaceActionMenu.svelte';

	interface Props {
		place: Place;
		placeTags: Tag[];
		allTags: Tag[];
		supabase: SupabaseClient;
		userId: string;
		enrichingId: string | null;
		onEnrich: (placeId: string) => void;
		onDelete: (placeId: string) => void;
		onTagClick: (tagId: string) => void;
		onTagsChanged: () => void;
		onNoteChanged?: (placeId: string, note: string) => void;
		onRatingChanged?: (placeId: string, rating: number | null) => void;
		onTagContextMenu?: (tag: Tag, x: number, y: number) => void;
		selected?: boolean;
		onSelect?: (placeId: string) => void;
		collections?: Collection[];
		collectionPlacesMap?: CollectionMemberMap;
		collectionPickerOpen?: boolean;
		onCollectionPickerToggle?: (placeId: string) => void;
		onCollectionPickerClose?: () => void;
		onToggleCollection?: (placeId: string, collectionId: string) => void;
		onRemoveFromCollection?: (placeId: string) => void;
		onDeletePlace?: (placeId: string) => void;
	}

	let {
		place,
		placeTags,
		allTags,
		supabase,
		userId,
		enrichingId,
		onEnrich,
		onDelete,
		onTagClick,
		onTagsChanged,
		onNoteChanged,
		onRatingChanged,
		onTagContextMenu,
		selected = false,
		onSelect,
		collections = [],
		collectionPlacesMap = {},
		collectionPickerOpen = false,
		onCollectionPickerToggle,
		onCollectionPickerClose,
		onToggleCollection,
		onRemoveFromCollection,
		onDeletePlace,
	}: Props = $props();

	let isCollectionContext = $derived(!!onRemoveFromCollection && !!onDeletePlace);
	let confirmDelete = $state(false);
	let actionMenuOpen = $state(false);
	let actionMenuAnchor = $state({ x: 0, y: 0 });

	// Swipe-to-delete state (mobile)
	let swipeX = $state(0);
	let swiping = $state(false);
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeLocked = false;
	let swipeConfirm = $state(false);
	const SWIPE_DELETE_W = 72;
	const SWIPE_SNAP = 36;

	function onSwipeStart(e: TouchEvent) {
		const t = e.touches[0];
		swipeStartX = t.clientX;
		swipeStartY = t.clientY;
		swipeLocked = false;
		swiping = false;
	}

	function onSwipeMove(e: TouchEvent) {
		const t = e.touches[0];
		const dx = t.clientX - swipeStartX;
		const dy = t.clientY - swipeStartY;

		if (!swipeLocked) {
			if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
				swipeLocked = true;
				return;
			}
			if (Math.abs(dx) > 5) swiping = true;
		}
		if (swipeLocked || !swiping) return;

		e.preventDefault();
		swipeX = Math.max(-SWIPE_DELETE_W, Math.min(0, dx));
	}

	function onSwipeEnd() {
		swiping = false;
		const snapped = swipeX < -SWIPE_SNAP ? -SWIPE_DELETE_W : 0;
		if (snapped === 0) swipeConfirm = false;
		swipeX = snapped;
	}

	function handleSwipeDelete() {
		if (isCollectionContext) {
			swipeX = 0;
			swipeConfirm = false;
			actionMenuAnchor = { x: window.innerWidth - 72, y: window.innerHeight / 2 };
			actionMenuOpen = true;
			return;
		}
		if (!swipeConfirm) {
			swipeConfirm = true;
			return;
		}
		swipeX = 0;
		swipeConfirm = false;
		onDelete(place.id);
	}

	let flipped = $state(false);
	let noteText = $state('');
	let contentPreview = $derived(noteText.trim() || null);
	let saving = $state(false);
	let saved = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const incoming = place.note ?? '';
		if (!saveTimer && !saving) noteText = incoming;
	});

	$effect(() => {
		return () => flushPendingSave();
	});

	function flushPendingSave() {
		if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; autoSave(); }
	}

	function handleMobileTap(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea, [role="button"]')) return;
		if (swipeX !== 0) { swipeX = 0; swipeConfirm = false; return; }
		if (!selected) {
			onSelect?.(place.id);
			return;
		}
		if (flipped) flushPendingSave();
		flipped = !flipped;
	}

	function handleDesktopFlip(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea, [role="button"]')) return;
		if (!selected) {
			onSelect?.(place.id);
			return;
		}
		if (flipped) flushPendingSave();
		flipped = !flipped;
	}

	function flipToBack(e: MouseEvent) {
		e.stopPropagation();
		if (!selected) onSelect?.(place.id);
		flipped = true;
	}

	function flipToFront(e: MouseEvent) {
		e.stopPropagation();
		flushPendingSave();
		flipped = false;
	}

	let prevSelected = $state(false);
	$effect(() => {
		if (prevSelected && !selected) {
			if (flipped) {
				flushPendingSave();
				flipped = false;
			}
			if (swipeX !== 0) { swipeX = 0; swipeConfirm = false; }
		}
		prevSelected = selected;
	});

	function scheduleAutoSave() {
		saved = false;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(autoSave, 300);
	}

	async function autoSave() {
		saveTimer = null;
		if (noteText === (place.note ?? '')) return;
		saving = true;
		saved = false;
		try {
			await supabase.from('places').update({ note: noteText }).eq('id', place.id);
			saved = true;
			onNoteChanged?.(place.id, noteText);
			setTimeout(() => { saved = false; }, 2000);
		} finally {
			saving = false;
		}
	}
</script>

<!-- ============================================================ -->
<!-- MOBILE LAYOUT (< sm) — 3D flip + swipe-to-delete            -->
<!-- Delete layer conditionally rendered to prevent flash-through -->
<!-- ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative rounded-xl sm:hidden {swipeX < 0 || swiping ? 'overflow-hidden' : ''}" data-place-id={place.id}>
	<!-- delete-background: only in DOM when swiping -->
	{#if swipeX < 0 || swiping}
		<div class="absolute inset-0 z-0 flex items-stretch justify-end">
			<button
				onclick={handleSwipeDelete}
				class="flex w-[72px] flex-col items-center justify-center gap-0.5 text-white transition-colors {swipeConfirm ? 'bg-danger-600' : 'bg-danger-500'}"
				aria-label={swipeConfirm ? 'Confirm delete' : 'Delete place'}
			>
				{#if swipeConfirm}
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
					<span class="text-xs font-bold">Confirm?</span>
				{:else}
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
				{/if}
			</button>
		</div>
	{/if}

	<!-- swipe-foreground: relative, z-[1], only translateX for swipe -->
	<div
		class="mobile-swipe-fg relative z-[1]"
		style="transform: translateX({swipeX}px); transition: {swiping ? 'none' : 'transform 0.2s ease-out'}"
		ontouchstart={onSwipeStart}
		ontouchmove={onSwipeMove}
		ontouchend={onSwipeEnd}
		onclick={handleMobileTap}
	>
		<!-- 3D flip container (same effect as desktop) -->
		<div class="[perspective:800px]">
			<div
				class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
				class:is-flipped={flipped}
			>
				<!-- MOBILE FRONT -->
				<div class="[backface-visibility:hidden]">
					<article class="flex h-[190px] cursor-pointer flex-col rounded-xl border bg-white p-3.5 {selected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}">
						<div class="mb-1 flex items-center justify-between">
							<div class="flex items-center gap-1">
								{#if place.category}
									<span class="rounded-full bg-warm-200 px-2 py-0.5 text-xs font-bold text-warm-600">{place.category}</span>
								{/if}
								{#if place.area}
									<span class="rounded-full bg-sage-200 px-2 py-0.5 text-xs font-bold text-sage-700">{place.area}</span>
								{/if}
							</div>
							<RatingDisplay
								placeId={place.id}
								userRating={place.user_rating}
								{supabase}
								onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
								compact
							/>
						</div>

						<h3 class="mt-1 line-clamp-1 text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>

						<div class="min-h-0 flex-1">
							{#if contentPreview}
								<p class="mt-0.5 line-clamp-2 text-xs italic leading-[1.35em] text-brand-500">
									{contentPreview}
								</p>
							{/if}
						</div>

						<div class="mb-1.5">
							<TagInput
								{supabase}
								placeId={place.id}
								{userId}
								{allTags}
								{placeTags}
								onUpdate={onTagsChanged}
								onTagClick={onTagClick}
								{onTagContextMenu}
							/>
							{#if !place.enriched_at && place.url}
								<button
									onclick={() => onEnrich(place.id)}
									disabled={enrichingId === place.id}
									class="mt-1 text-xs font-semibold text-brand-600 disabled:opacity-50"
								>
									{enrichingId === place.id ? '...' : 'Enrich'}
								</button>
							{/if}
						</div>

						<div class="mt-1.5 flex items-center gap-1 border-t border-warm-100 pt-1.5">
							{#if place.url}
								<a
									href={place.url}
									target="_blank"
									class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
									aria-label="Open in Google Maps"
								>
								<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
								</svg>
									Maps
								</a>
						{/if}
						{#if onCollectionPickerToggle}
								<button
									onclick={(e) => { e.stopPropagation(); onCollectionPickerToggle?.(place.id); }}
									class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
									aria-label="Add to collection"
								>
									<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<rect x="3" y="3" width="7" height="7" rx="1" />
										<rect x="14" y="3" width="7" height="7" rx="1" />
										<rect x="3" y="14" width="7" height="7" rx="1" />
										<rect x="14" y="14" width="7" height="7" rx="1" />
									</svg>
									<svg class="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
										<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
									</svg>
								</button>
							{/if}
						</div>
					</article>
				</div>

				<!-- MOBILE BACK (Notes only) -->
				<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
					<article class="flex h-[190px] cursor-pointer flex-col rounded-xl border border-warm-200 bg-white p-3.5">
						<div class="mb-1.5 flex items-center justify-between">
							<h3 class="min-w-0 flex-1 truncate text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>
							<div class="ml-2 flex items-center gap-1.5">
								{#if saving}
									<span class="text-xs text-warm-400">Saving...</span>
								{:else if saved}
									<span class="text-xs text-sage-600">Saved</span>
								{/if}
								<button
									onclick={flipToFront}
									class="rounded-md p-1 text-warm-400 hover:bg-warm-100 hover:text-warm-600"
									aria-label="Flip back"
								>
									<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
									</svg>
								</button>
							</div>
						</div>
						<textarea
							id="note-mobile-{place.id}"
							bind:value={noteText}
							oninput={scheduleAutoSave}
							placeholder="Write your notes here..."
							class="flex-1 w-full resize-none rounded-lg border border-warm-200 bg-warm-50 p-2 text-sm leading-relaxed text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
						></textarea>
					</article>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- ============================================================ -->
<!-- DESKTOP LAYOUT (>= sm) — 3D flip animation                   -->
<!-- ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hidden sm:block [perspective:1000px]" data-place-id={place.id} onclick={handleDesktopFlip}>
	<div
		class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
		class:is-flipped={flipped}
	>
		<!-- DESKTOP FRONT -->
		<div class="[backface-visibility:hidden]">
			<article class="group flex h-[260px] cursor-pointer flex-col rounded-2xl border bg-white p-5 transition-all hover:shadow-md hover:shadow-warm-200/50 {selected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}">
				<div class="mb-3 flex items-center justify-between">
					<div class="flex flex-wrap items-center gap-1.5">
						{#if place.category}
							<span class="rounded-full bg-warm-200 px-2.5 py-0.5 text-xs font-bold text-warm-600">{place.category}</span>
						{/if}
						{#if place.area}
							<span class="rounded-full bg-sage-200 px-2 py-0.5 text-xs font-bold text-sage-700">{place.area}</span>
						{/if}
					</div>
					<RatingDisplay
						placeId={place.id}
						userRating={place.user_rating}
						{supabase}
						onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
					/>
				</div>

				<h3 class="mb-1 line-clamp-1 text-lg font-extrabold leading-snug text-warm-800">{place.title}</h3>

				<div class="min-h-0 flex-1">
					{#if contentPreview}
						<p class="line-clamp-2 text-sm font-medium italic leading-[1.4em] text-brand-500">
							{contentPreview}
						</p>
					{:else}
						<p class="text-sm italic text-warm-300">Add a note...</p>
					{/if}
				</div>

				<div class="mb-3">
					<TagInput
						{supabase}
						placeId={place.id}
						{userId}
						{allTags}
						{placeTags}
						onUpdate={onTagsChanged}
						onTagClick={onTagClick}
						{onTagContextMenu}
					/>
				</div>

			<div class="mt-auto flex items-center gap-1 border-t border-warm-200 pt-2.5">
				{#if !place.enriched_at && place.url}
						<button
							onclick={() => onEnrich(place.id)}
							disabled={enrichingId === place.id}
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
						>
							{#if enrichingId === place.id}
								<svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
								</svg>
							{/if}
							Get Details
						</button>
					{/if}
					{#if place.url}
						<a
							href={place.url}
							target="_blank"
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Open in Google Maps"
						>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
							<circle cx="12" cy="10" r="3" />
						</svg>
							Maps
						</a>
				{/if}
				{#if onCollectionPickerToggle}
						<button
							onclick={(e) => { e.stopPropagation(); onCollectionPickerToggle?.(place.id); }}
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Add to collection"
						>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7" rx="1" />
							<rect x="14" y="3" width="7" height="7" rx="1" />
							<rect x="3" y="14" width="7" height="7" rx="1" />
							<rect x="14" y="14" width="7" height="7" rx="1" />
						</svg>
						<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
						</button>
					{/if}
					<div class="ml-auto">
						{#if isCollectionContext}
							<button
								onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); actionMenuAnchor = { x: rect.right - 224, y: rect.bottom }; actionMenuOpen = true; }}
								class="rounded-md p-2 text-warm-300 opacity-0 transition-opacity hover:bg-warm-100 hover:text-warm-500 group-hover:opacity-100"
								aria-label="Place actions"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						{:else if confirmDelete}
							<button
								onclick={() => { onDelete(place.id); confirmDelete = false; }}
								class="rounded-md bg-danger-100 px-2 py-1 text-xs font-medium text-danger-700 hover:bg-danger-200"
							>
								Confirm
							</button>
							<button onclick={() => { confirmDelete = false; }} class="ml-1 text-xs text-warm-400">Cancel</button>
						{:else}
							<button
								onclick={() => { confirmDelete = true; }}
								class="rounded-md p-2 text-warm-300 opacity-0 transition-opacity hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
								aria-label="Delete place"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</article>
		</div>

		<!-- DESKTOP BACK (Notes only) -->
		<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
			<article class="flex h-[260px] flex-col rounded-2xl border border-warm-200 bg-white p-5">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="min-w-0 flex-1 truncate text-lg font-extrabold leading-snug text-warm-800">{place.title}</h3>
					<div class="flex shrink-0 items-center gap-2">
						{#if saving}
							<span class="text-xs text-warm-400">Saving...</span>
						{:else if saved}
							<span class="text-xs text-sage-600">Saved</span>
						{/if}
						<button
							onclick={flipToFront}
							class="rounded-lg p-2 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
							aria-label="Flip back"
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
							</svg>
						</button>
					</div>
				</div>

				<textarea
					id="note-desktop-{place.id}"
					bind:value={noteText}
					oninput={scheduleAutoSave}
					placeholder="Write your notes about this place..."
					class="flex-1 resize-none rounded-xl border border-warm-200 bg-warm-50 p-3 text-sm leading-relaxed text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
				></textarea>
			</article>
		</div>
	</div>
</div>

<style>
	.is-flipped {
		transform: rotateY(180deg);
	}
</style>

{#if collectionPickerOpen && onToggleCollection && onCollectionPickerClose}
	<AddToCollectionModal
		placeIds={[place.id]}
		label={place.title}
		{collections}
		collectionPlacesMap={collectionPlacesMap}
		onToggle={(ids, colId) => onToggleCollection(ids[0], colId)}
		onClose={onCollectionPickerClose}
	/>
{/if}

{#if actionMenuOpen && isCollectionContext}
	<PlaceActionMenu
		anchorX={actionMenuAnchor.x}
		anchorY={actionMenuAnchor.y}
		onRemoveFromCollection={() => onRemoveFromCollection!(place.id)}
		onDeletePlace={() => onDeletePlace!(place.id)}
		onClose={() => { actionMenuOpen = false; }}
	/>
{/if}
