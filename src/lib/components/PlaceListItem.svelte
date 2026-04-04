<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Place, Tag, Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { textColorForBg } from '$lib/tag-colors';
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
		onTagClick: (tagId: string) => void;
		onTagContextMenu?: (tag: Tag, x: number, y: number) => void;
		onTagsChanged: () => void;
		onNoteChanged?: (placeId: string, note: string) => void;
		onRatingChanged?: (placeId: string, rating: number | null) => void;
		onDelete?: (placeId: string) => void;
		selected?: boolean;
		onSelect?: (placeId: string) => void;
		collections?: Collection[];
		collectionPlacesMap?: CollectionMemberMap;
		onToggleCollection?: (placeId: string, collectionId: string) => void;
		onRemoveFromCollection?: (placeId: string) => void;
		onDeletePlace?: (placeId: string) => void;
	}

	let { place, placeTags, allTags, supabase, userId, onTagClick, onTagContextMenu, onTagsChanged, onNoteChanged, onRatingChanged, onDelete, selected = false, onSelect, collections = [], collectionPlacesMap = {}, onToggleCollection, onRemoveFromCollection, onDeletePlace }: Props = $props();

	let isCollectionContext = $derived(!!onRemoveFromCollection && !!onDeletePlace);
	let actionMenuOpen = $state(false);
	let actionMenuAnchor = $state({ x: 0, y: 0 });

	let showCollectionPicker = $state(false);

	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));
	let firstTag = $derived(userTags[0] ?? null);
	let extraCount = $derived(Math.max(0, userTags.length - 1));

	// Dynamic mobile tag measurement
	let mobileTagRowEl = $state<HTMLDivElement | null>(null);
	let mobileTagMeasureEl = $state<HTMLDivElement | null>(null);
	let mobileVisibleCount = $state(0);
	let mobileVisibleTags = $derived(userTags.slice(0, mobileVisibleCount));
	let mobileHiddenCount = $derived(Math.max(0, userTags.length - mobileVisibleCount));

	function measureMobileTags() {
		if (!mobileTagRowEl || !mobileTagMeasureEl || userTags.length === 0) {
			mobileVisibleCount = 0;
			return;
		}
		const available = mobileTagRowEl.clientWidth;
		const gap = 4;
		const indicatorW = 28;
		const children = Array.from(mobileTagMeasureEl.children) as HTMLElement[];
		if (children.length === 0) { mobileVisibleCount = 0; return; }

		let used = 0;
		let count = 0;
		const max = Math.min(children.length, 3);

		for (let i = 0; i < max; i++) {
			const w = children[i].offsetWidth;
			const next = used + (count > 0 ? gap : 0) + w;
			const needsIndicator = i < children.length - 1;
			if (next + (needsIndicator ? gap + indicatorW : 0) > available) break;
			used = next;
			count++;
		}
		mobileVisibleCount = count;
	}

	$effect(() => {
		const _tags = userTags;
		const _row = mobileTagRowEl;
		if (!_row || !mobileTagMeasureEl) {
			mobileVisibleCount = 0;
			return;
		}
		measureMobileTags();
		const observer = new ResizeObserver(() => measureMobileTags());
		observer.observe(_row);
		return () => observer.disconnect();
	});

	let expanded = $state(false);
	let confirmDelete = $state(false);
	let noteText = $state('');
	let saving = $state(false);
	let saved = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		noteText = place.note ?? '';
	});

	// Swipe state (mobile only)
	let swipeX = $state(0);
	let swiping = $state(false);
	let startX = 0;
	let startY = 0;
	let locked = false;
	let swipeConfirm = $state(false);
	const DELETE_WIDTH = 72;
	const SNAP_THRESHOLD = 36;

	function onTouchStart(e: TouchEvent) {
		const t = e.touches[0];
		startX = t.clientX;
		startY = t.clientY;
		locked = false;
		swiping = false;
	}

	function onTouchMove(e: TouchEvent) {
		const t = e.touches[0];
		const dx = t.clientX - startX;
		const dy = t.clientY - startY;

		if (!locked) {
			if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
				locked = true;
				return;
			}
			if (Math.abs(dx) > 5) {
				swiping = true;
			}
		}
		if (locked || !swiping) return;

		e.preventDefault();
		swipeX = Math.max(-DELETE_WIDTH, Math.min(0, dx + (swipeX < -SNAP_THRESHOLD ? -DELETE_WIDTH : 0) === -DELETE_WIDTH ? dx - DELETE_WIDTH : dx));
		swipeX = Math.max(-DELETE_WIDTH, Math.min(0, dx));
	}

	function onTouchEnd() {
		swiping = false;
		const snapped = swipeX < -SNAP_THRESHOLD ? -DELETE_WIDTH : 0;
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
		onDelete?.(place.id);
	}

	function handleMobileRowTap(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea')) return;
		if (swipeX !== 0) { swipeX = 0; swipeConfirm = false; return; }
		if (!selected) {
			onSelect?.(place.id);
			return;
		}
		expanded = !expanded;
	}

	function handleDesktopRowClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea')) return;
		onSelect?.(place.id);
		expanded = !expanded;
	}

	let prevSelected = $state(false);
	$effect(() => {
		if (prevSelected && !selected) {
			if (expanded) {
				if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; autoSave(); }
				expanded = false;
			}
			if (swipeX !== 0) { swipeX = 0; swipeConfirm = false; }
		}
		prevSelected = selected;
	});

	function scheduleAutoSave() {
		saved = false;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(autoSave, 800);
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div data-place-id={place.id}>
	<!-- Mobile: swipe container -->
	<div class="relative overflow-hidden sm:hidden">
		<!-- Delete action (revealed behind) -->
		{#if onDelete}
			<button
				onclick={handleSwipeDelete}
				class="absolute right-0 top-0 flex h-full w-[72px] flex-col items-center justify-center gap-0.5 rounded-r-xl text-white transition-colors {swipeConfirm ? 'bg-danger-600' : 'bg-danger-500'}"
				aria-label={swipeConfirm ? 'Confirm delete' : 'Delete place'}
			>
				{#if swipeConfirm}
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
					<span class="text-[10px] font-bold">Confirm?</span>
				{:else}
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
				{/if}
			</button>
		{/if}

		<!-- Swipeable row -->
		<div
			class="relative {selected ? 'bg-brand-50' : 'bg-white'}"
			style="transform: translateX({swipeX}px); transition: {swiping ? 'none' : 'transform 0.2s ease-out'}"
			ontouchstart={onTouchStart}
			ontouchmove={onTouchMove}
			ontouchend={onTouchEnd}
		>
			<div
				class="cursor-pointer px-3 py-2"
				onclick={handleMobileRowTap}
			>
				<!-- Primary row: Name | Area • Category | Rating -->
				<div class="flex items-center gap-2">
					<svg
						class="h-3.5 w-3.5 shrink-0 text-warm-300 transition-transform duration-200 {expanded ? 'rotate-90' : ''}"
						viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>

					<h3 class="min-w-0 flex-1 text-[15px] font-extrabold text-warm-800 {expanded ? '' : 'truncate'}">{place.title}</h3>

					{#if selected && !expanded}
						<span class="shrink-0 text-[9px] font-medium text-brand-400 animate-pulse">Tap to expand</span>
					{/if}

					<div class="w-14 shrink-0 text-right">
						<RatingDisplay
							placeId={place.id}
							userRating={place.user_rating}
							{supabase}
							onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
							compact
						/>
					</div>

					{#if place.url}
						<a
							href={place.url}
							target="_blank"
							class="shrink-0 rounded p-1 text-warm-300 transition-colors hover:text-warm-600"
							aria-label="Open in Maps"
						>
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
							</svg>
						</a>
					{/if}
				</div>

				<!-- Secondary row: Area • Category | Tag summary -->
				<div class="mt-0.5 flex items-center gap-2 pl-[1.375rem]">
					<span class="shrink-0 text-xs text-warm-400">
						{#if place.area && place.category}
							{place.area} · {place.category}
						{:else if place.area}
							{place.area}
						{:else if place.category}
							{place.category}
						{/if}
					</span>

					<!-- Hidden measurement row -->
					<div
						bind:this={mobileTagMeasureEl}
						class="pointer-events-none invisible absolute right-0 flex items-center gap-1"
						aria-hidden="true"
					>
						{#each userTags.slice(0, 3) as tag (tag.id)}
							<span class="shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold">{tag.name}</span>
						{/each}
					</div>

					<!-- Visible tags -->
					<div bind:this={mobileTagRowEl} class="flex min-w-0 flex-1 items-center justify-end gap-1">
						{#if userTags.length > 0}
							{#each mobileVisibleTags as tag (tag.id)}
								<button
									onclick={() => onTagClick(tag.id)}
									oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onTagContextMenu?.(tag, e.clientX, e.clientY); }}
								class="max-w-[72px] shrink-0 truncate rounded-full px-1.5 py-px text-[10px] font-semibold hover:opacity-80"
								style="background-color: {tag.color ?? '#8a7e72'}; color: {textColorForBg(tag.color ?? '#8a7e72')}"
								>{tag.name}</button>
							{/each}
							{#if mobileHiddenCount > 0}
								<span class="shrink-0 text-[10px] font-bold text-warm-400">+{mobileHiddenCount}</span>
							{/if}
						{:else}
							<span class="text-[10px] text-warm-300">—</span>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Desktop: standard row -->
	<div
		class="group hidden h-11 cursor-pointer items-center gap-3 px-4 transition-colors sm:flex {selected ? 'bg-brand-50/70' : 'hover:bg-warm-50/80'}"
		onclick={handleDesktopRowClick}
	>
		<svg
			class="h-3 w-3 shrink-0 text-warm-300 transition-transform duration-200 {expanded ? 'rotate-90' : ''}"
			viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
		>
			<polyline points="9 18 15 12 9 6" />
		</svg>

		<h3 class="min-w-0 flex-[2] truncate text-[15px] font-extrabold text-warm-800">{place.title}</h3>

		<div class="flex w-44 shrink-0 items-center gap-1 text-xs lg:w-52">
			{#if place.area}
				<span class="truncate font-medium text-sage-500">{place.area}</span>
			{/if}
			{#if place.area && place.category}
				<span class="text-warm-300">·</span>
			{/if}
			{#if place.category}
				<span class="truncate text-warm-400">{place.category}</span>
			{/if}
		</div>

		<div class="w-16 shrink-0 text-right">
			<RatingDisplay
				placeId={place.id}
				userRating={place.user_rating}
				{supabase}
				onRatingChanged={(id, r) => onRatingChanged?.(id, r)}
				compact
			/>
		</div>

		<div class="flex w-28 shrink-0 items-center gap-1">
			{#if firstTag}
				<button
					onclick={() => onTagClick(firstTag.id)}
					oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onTagContextMenu?.(firstTag, e.clientX, e.clientY); }}
				class="max-w-[88px] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold hover:opacity-80"
				style="background-color: {firstTag.color ?? '#8a7e72'}; color: {textColorForBg(firstTag.color ?? '#8a7e72')}"
				>{firstTag.name}</button>
				{#if extraCount > 0}
					<span class="text-[10px] font-bold text-warm-400">+{extraCount}</span>
				{/if}
			{:else}
				<span class="text-[10px] text-warm-300">—</span>
			{/if}
		</div>

		<div class="flex w-16 shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
			{#if onToggleCollection}
				<button
					onclick={(e) => { e.stopPropagation(); showCollectionPicker = true; }}
					class="rounded p-1 text-warm-300 transition-colors hover:bg-brand-50 hover:text-brand-500"
					aria-label="Add to collection"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					</svg>
				</button>
			{/if}
			{#if place.url}
				<a
					href={place.url}
					target="_blank"
					class="rounded p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-600"
					aria-label="Open in Maps"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
			{/if}
			{#if onDelete}
				{#if isCollectionContext}
					<button
						onclick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); actionMenuAnchor = { x: rect.right - 224, y: rect.bottom }; actionMenuOpen = true; }}
						class="rounded p-1 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500"
						aria-label="Place actions"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
					</button>
				{:else if confirmDelete}
					<button
						onclick={() => { onDelete(place.id); confirmDelete = false; }}
						class="rounded px-1 py-0.5 text-[9px] font-bold text-danger-600 hover:bg-danger-50"
					>Yes</button>
					<button onclick={() => { confirmDelete = false; }} class="rounded px-0.5 py-0.5 text-[9px] text-warm-400 hover:text-warm-600">No</button>
				{:else}
					<button
						onclick={() => { confirmDelete = true; }}
						class="rounded p-1 text-warm-300 transition-colors hover:bg-danger-50 hover:text-danger-600"
						aria-label="Delete"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
					</button>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Expanded detail panel -->
	{#if expanded}
		<div class="border-t border-warm-100 bg-warm-50/50 px-4 pb-3 pt-2.5 pl-[2.25rem] sm:pl-[2.75rem]">
			<div class="flex flex-col gap-3 sm:flex-row sm:gap-6">
				<!-- Notes -->
				<div class="flex-1">
					<div class="mb-0.5 flex items-center gap-2">
						<p class="text-[11px] font-bold uppercase tracking-wide text-warm-400">Notes</p>
						{#if saving}
							<span class="text-[9px] text-warm-400">Saving...</span>
						{:else if saved}
							<span class="text-[9px] text-sage-600">Saved</span>
						{/if}
					</div>
					<textarea
						bind:value={noteText}
						oninput={scheduleAutoSave}
						onclick={(e) => e.stopPropagation()}
						placeholder="Add a note..."
						rows="2"
						class="w-full resize-none rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 text-[13px] leading-relaxed text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
					></textarea>
				</div>

				<!-- Tags -->
				<div class="flex-1">
					<p class="mb-1 text-[11px] font-bold uppercase tracking-wide text-warm-400">Tags</p>
					<TagInput
						{supabase}
						placeId={place.id}
						{userId}
						{allTags}
						{placeTags}
						onUpdate={onTagsChanged}
						onTagClick={onTagClick}
						{onTagContextMenu}
						maxVisible={20}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if showCollectionPicker && onToggleCollection}
	<AddToCollectionModal
		placeIds={[place.id]}
		label={place.title}
		{collections}
		collectionPlacesMap={collectionPlacesMap}
		onToggle={(ids, colId) => onToggleCollection(ids[0], colId)}
		onClose={() => { showCollectionPicker = false; }}
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
