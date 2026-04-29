<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Place, Tag, Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import TagInput from './TagInput.svelte';
	import AddToCollectionModal from './AddToCollectionModal.svelte';
	import RatingDisplay from './RatingDisplay.svelte';
	import PlaceActionMenu from './PlaceActionMenu.svelte';
	import { colorForTag } from '$lib/tag-colors';
	import { getNextOrderIndex } from '$lib/tag-order';
	import { normalizeTagName, toDisplayName } from '$lib/tag-utils';

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
		onTagsChanged: (optimistic?: { newTags: Tag[]; placeId: string; tagIds: string[] }) => void;
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
	let cardMenuOpen = $state(false);
	let collectionAnchor = $state({ x: 0, y: 0 });

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
		onSelect?.(place.id);
		if (selected) {
			if (flipped) flushPendingSave();
			flipped = !flipped;
		}
	}

	function handleDesktopFlip(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea, [role="button"]')) return;
		onSelect?.(place.id);
		if (selected) {
			if (flipped) flushPendingSave();
			flipped = !flipped;
		}
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

	let autoTagging = $state(false);

	async function handleAutoTag() {
		const candidates = [place.category, place.area].filter((v): v is string => !!v);
		if (candidates.length === 0) return;
		autoTagging = true;
		try {
			const resolved: Tag[] = [];
			const toCreate: { displayName: string }[] = [];

			for (const name of candidates) {
				const displayName = toDisplayName(name);
				const normalized = normalizeTagName(displayName);
				const existing = allTags.find((t) => normalizeTagName(t.name) === normalized);
				if (existing) {
					resolved.push(existing);
				} else if (!toCreate.some((c) => normalizeTagName(c.displayName) === normalized)) {
					toCreate.push({ displayName });
				}
			}

			if (toCreate.length > 0) {
				const baseIndex = await getNextOrderIndex(supabase, userId);
				const rows = toCreate.map(({ displayName }, i) => ({
					user_id: userId,
					name: displayName,
					color: colorForTag(displayName),
					order_index: baseIndex + i,
				} as Record<string, unknown>));
				const { data } = await supabase.from('tags').insert(rows).select();
				if (data) resolved.push(...(data as Tag[]));
			}

			const tagIdsToLink = resolved
				.filter((t) => !placeTags.some((pt) => pt.id === t.id))
				.map((t) => t.id);
			if (tagIdsToLink.length > 0) {
				const ptRows = tagIdsToLink.map((tag_id) => ({ place_id: place.id, tag_id }));
				await supabase
					.from('place_tags')
					.upsert(ptRows, { onConflict: 'place_id,tag_id', ignoreDuplicates: true });
			}

			onTagsChanged({
				newTags: resolved,
				placeId: place.id,
				tagIds: resolved.map((t) => t.id),
			});
		} finally {
			autoTagging = false;
		}
	}
</script>

<!-- ============================================================ -->
<!-- MOBILE LAYOUT (< sm) — 3D flip + swipe-to-delete            -->
<!-- Delete layer conditionally rendered to prevent flash-through -->
<!-- ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative rounded-xl sm:hidden {swipeX < 0 || swiping ? 'overflow-hidden' : ''} {cardMenuOpen ? 'z-10' : ''}" data-place-id={place.id}>
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
					<article class="flex h-[148px] cursor-pointer flex-col rounded-xl border bg-white p-3 {selected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}">
						<div class="mb-0.5 flex items-center justify-between gap-2">
							<h3 class="min-w-0 flex-1 line-clamp-1 text-[15px] font-extrabold leading-snug text-warm-800">{place.title}</h3>
							<div class="flex shrink-0 items-center gap-0.5">
								<RatingDisplay
									placeId={place.id}
									userRating={place.user_rating}
									{supabase}
									onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
									compact
								/>
								<div class="relative">
									<button
										onclick={(e) => { e.stopPropagation(); cardMenuOpen = !cardMenuOpen; }}
										class="rounded-md p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500"
										aria-label="More actions"
									>
										<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
											<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
										</svg>
									</button>
									{#if cardMenuOpen}
										<div class="fixed inset-0 z-40" onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; confirmDelete = false; }} role="presentation"></div>
										<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white py-1 shadow-lg">
											{#if place.url}
												<a
													href={place.url}
													target="_blank"
													onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; }}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50"
												>
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
													</svg>
													Open in Map
												</a>
											{/if}
											{#if onCollectionPickerToggle}
												<button
													onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); collectionAnchor = { x: rect.left, y: rect.bottom + 4 }; cardMenuOpen = false; onCollectionPickerToggle?.(place.id); }}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50"
												>
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
														<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
													</svg>
													Add to Collection
												</button>
											{/if}
											{#if !place.enriched_at && place.url}
												<button
													onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; onEnrich(place.id); }}
													disabled={enrichingId === place.id}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-warm-50 disabled:opacity-50"
												>
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
													</svg>
													{enrichingId === place.id ? 'Fetching...' : 'Get Details'}
												</button>
											{/if}
											{#if place.category || place.area}
												<button
													onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; handleAutoTag(); }}
													disabled={autoTagging}
													class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50 disabled:opacity-50"
												>
													<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
													</svg>
													{autoTagging ? 'Tagging...' : 'Auto Tag'}
												</button>
											{/if}
											{#if isCollectionContext}
												<button
													onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; confirmDelete = false; actionMenuAnchor = { x: window.innerWidth - 72, y: window.innerHeight / 2 }; actionMenuOpen = true; }}
													class="flex w-full items-center gap-2.5 border-t border-warm-100 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
												>
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
													</svg>
													Remove / Delete
												</button>
											{:else if confirmDelete}
												<div class="border-t border-warm-100 px-3 py-2">
													<p class="mb-1.5 text-xs font-medium text-danger-600">Delete this place?</p>
													<div class="flex items-center gap-2">
														<button
															onclick={(e) => { e.stopPropagation(); onDelete(place.id); confirmDelete = false; cardMenuOpen = false; }}
															class="rounded-md bg-danger-600 px-3 py-1 text-xs font-bold text-white hover:bg-danger-700"
														>Confirm</button>
														<button
															onclick={(e) => { e.stopPropagation(); confirmDelete = false; }}
															class="text-xs font-medium text-warm-400 hover:text-warm-600"
														>Cancel</button>
													</div>
												</div>
											{:else}
												<button
													onclick={(e) => { e.stopPropagation(); confirmDelete = true; }}
													class="flex w-full items-center gap-2.5 border-t border-warm-100 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
												>
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
														<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
													</svg>
													Delete
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>

						<div class="min-h-0 flex-1">
							{#if contentPreview}
								<p class="mt-0.5 line-clamp-2 text-[13px] italic leading-snug text-brand-500">
									{contentPreview}
								</p>
							{/if}
						</div>

						<div class="mb-0">
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
					</article>
				</div>

				<!-- MOBILE BACK (Notes only) -->
				<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
					<article class="flex h-[148px] cursor-pointer flex-col rounded-xl border border-warm-200 bg-white p-3">
						<div class="mb-1 flex items-center justify-between">
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
							class="flex-1 w-full resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-stone-500 placeholder:text-warm-300/70 placeholder:italic focus:outline-none"
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
<div class="hidden sm:block [perspective:1000px] {cardMenuOpen ? 'relative z-10' : ''}" data-place-id={place.id} onclick={handleDesktopFlip}>
	<div
		class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
		class:is-flipped={flipped}
	>
		<!-- DESKTOP FRONT -->
		<div class="[backface-visibility:hidden]">
		<article class="group flex h-[170px] cursor-pointer flex-col space-y-2 rounded-2xl border bg-white p-4 transition-all hover:shadow-md hover:shadow-warm-200/50 {selected ? 'border-brand-400 ring-2 ring-brand-400/30' : 'border-warm-200'}">
			<div class="flex items-center justify-between gap-2">
					<h3 class="min-w-0 flex-1 line-clamp-1 text-base font-extrabold tracking-tight leading-snug text-warm-800">{place.title}</h3>
					<div class="flex shrink-0 items-center gap-0.5">
						<RatingDisplay
							placeId={place.id}
							userRating={place.user_rating}
							{supabase}
							onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
						/>
						<div class="relative">
							<button
								onclick={(e) => { e.stopPropagation(); cardMenuOpen = !cardMenuOpen; }}
								class="rounded-md p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500"
								aria-label="More actions"
							>
								<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
									<circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
								</svg>
							</button>
							{#if cardMenuOpen}
								<div class="fixed inset-0 z-40" onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; confirmDelete = false; }} role="presentation"></div>
								<div class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-warm-200 bg-white py-1 shadow-lg">
									{#if place.url}
										<a
											href={place.url}
											target="_blank"
											onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; }}
											class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50"
										>
											<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
											</svg>
											Open in Map
										</a>
									{/if}
									{#if onCollectionPickerToggle}
										<button
											onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); collectionAnchor = { x: rect.left, y: rect.bottom + 4 }; cardMenuOpen = false; onCollectionPickerToggle?.(place.id); }}
											class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50"
										>
											<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
												<rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
											</svg>
											Add to Collection
										</button>
									{/if}
									{#if !place.enriched_at && place.url}
										<button
											onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; onEnrich(place.id); }}
											disabled={enrichingId === place.id}
											class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-warm-50 disabled:opacity-50"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
											</svg>
											{enrichingId === place.id ? 'Fetching...' : 'Get Details'}
										</button>
									{/if}
									{#if place.category || place.area}
										<button
											onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; handleAutoTag(); }}
											disabled={autoTagging}
											class="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-warm-600 hover:bg-warm-50 disabled:opacity-50"
										>
											<svg class="h-4 w-4 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
											</svg>
											{autoTagging ? 'Tagging...' : 'Auto Tag'}
										</button>
									{/if}
									{#if isCollectionContext}
										<button
											onclick={(e) => { e.stopPropagation(); cardMenuOpen = false; confirmDelete = false; const rect = e.currentTarget.getBoundingClientRect(); actionMenuAnchor = { x: rect.right - 224, y: rect.bottom }; actionMenuOpen = true; }}
											class="flex w-full items-center gap-2.5 border-t border-warm-100 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
											</svg>
											Remove / Delete
										</button>
									{:else if confirmDelete}
										<div class="border-t border-warm-100 px-3 py-2">
											<p class="mb-1.5 text-xs font-medium text-danger-600">Delete this place?</p>
											<div class="flex items-center gap-2">
												<button
													onclick={(e) => { e.stopPropagation(); onDelete(place.id); confirmDelete = false; cardMenuOpen = false; }}
													class="rounded-md bg-danger-600 px-3 py-1 text-xs font-bold text-white hover:bg-danger-700"
												>Confirm</button>
												<button
													onclick={(e) => { e.stopPropagation(); confirmDelete = false; }}
													class="text-xs font-medium text-warm-400 hover:text-warm-600"
												>Cancel</button>
											</div>
										</div>
									{:else}
										<button
											onclick={(e) => { e.stopPropagation(); confirmDelete = true; }}
											class="flex w-full items-center gap-2.5 border-t border-warm-100 px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
										>
											<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
											</svg>
											Delete
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="min-h-0 flex-1">
					{#if contentPreview}
					<p class="line-clamp-2 text-sm italic leading-relaxed text-warm-500">
						{contentPreview}
					</p>
					{/if}
				</div>

				<div class="mb-0">
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
			</article>
		</div>

		<!-- DESKTOP BACK (Notes only) -->
		<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
			<article class="flex h-[170px] flex-col rounded-2xl border border-warm-200 bg-white p-4">
				<div class="mb-1 flex items-center justify-between">
				<h3 class="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight leading-snug text-warm-800">{place.title}</h3>
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
					class="flex-1 resize-none border-none bg-transparent p-0 text-sm leading-relaxed text-stone-500 placeholder:text-warm-300/70 placeholder:italic focus:outline-none"
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
		anchorX={collectionAnchor.x}
		anchorY={collectionAnchor.y}
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
