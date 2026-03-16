<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Place, Tag } from '$lib/types/database';
	import TagInput from './TagInput.svelte';

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
		onTagContextMenu?: (tag: Tag, x: number, y: number) => void;
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
		onTagContextMenu
	}: Props = $props();

	let confirmDelete = $state(false);
	let mobileTagsExpanded = $state(false);
	let mobileTagContainerEl = $state<HTMLDivElement | null>(null);
	let mobileTagMeasureEl = $state<HTMLDivElement | null>(null);
	let mobileVisibleCount = $state(3);
	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));
	let mobileDisplayTags = $derived(
		mobileTagsExpanded ? userTags : userTags.slice(0, mobileVisibleCount)
	);
	let mobileHiddenCount = $derived(Math.max(0, userTags.length - mobileVisibleCount));
	let contentPreview = $derived(noteText.trim() || place.description || null);
	let contentIsNote = $derived(!!noteText.trim());

	function measureMobileTags() {
		if (!mobileTagMeasureEl || !mobileTagContainerEl || userTags.length === 0) {
			mobileVisibleCount = userTags.length;
			return;
		}

		const containerWidth = mobileTagContainerEl.clientWidth;
		const gap = parseFloat(getComputedStyle(mobileTagMeasureEl).gap) || 4;
		const children = Array.from(mobileTagMeasureEl.children) as HTMLElement[];

		if (children.length === 0) { mobileVisibleCount = 0; return; }

		let totalWidth = 0;
		for (let i = 0; i < children.length; i++) {
			if (i > 0) totalWidth += gap;
			totalWidth += children[i].offsetWidth;
		}
		if (totalWidth <= containerWidth) {
			mobileVisibleCount = children.length;
			return;
		}

		const indicatorReserve = 36;
		const available = containerWidth - indicatorReserve - gap;
		let used = 0;
		let count = 0;

		for (let i = 0; i < children.length; i++) {
			const w = children[i].offsetWidth;
			const next = used + (count > 0 ? gap : 0) + w;
			if (next > available) break;
			used = next;
			count++;
		}
		mobileVisibleCount = Math.max(1, count);
	}

	$effect(() => {
		const _tags = userTags;
		const _container = mobileTagContainerEl;
		const _measure = mobileTagMeasureEl;
		if (!_container || !_measure || _tags.length === 0) {
			mobileVisibleCount = _tags.length || 0;
			return;
		}
		measureMobileTags();
		const observer = new ResizeObserver(() => measureMobileTags());
		observer.observe(_container);
		return () => observer.disconnect();
	});

	let flipped = $state(false);
	let noteText = $state(place.note ?? '');
	let saving = $state(false);
	let saved = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function formatRating(rating: number | null): string {
		if (!rating) return '';
		return rating.toFixed(1);
	}

	function handleFlip(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea, [role="button"]')) return;
		flipped = !flipped;
	}

	function flipToBack(e: MouseEvent) {
		e.stopPropagation();
		flipped = true;
	}

	function flipToFront(e: MouseEvent) {
		e.stopPropagation();
		if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; autoSave(); }
		flipped = false;
	}

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

<!-- ============================================================ -->
<!-- MOBILE LAYOUT (< sm) — 3D flip animation                     -->
<!-- ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="sm:hidden [perspective:800px]" onclick={handleFlip}>
	<div
		class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
		class:is-flipped={flipped}
	>
		<!-- MOBILE FRONT -->
		<div class="[backface-visibility:hidden]">
			<article class="cursor-pointer rounded-xl border border-warm-200 bg-white p-2.5 transition-all hover:shadow-sm">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1">
						{#if place.category}
							<span class="rounded-full bg-warm-200 px-1.5 py-px text-[9px] font-bold text-warm-600">{place.category}</span>
						{/if}
						{#if place.area}
							<span class="rounded-full bg-sage-200 px-1.5 py-px text-[9px] font-bold text-sage-700">{place.area}</span>
						{/if}
					</div>
					{#if place.rating}
						<span class="text-[11px] font-extrabold text-warm-700">{formatRating(place.rating)}<span class="text-brand-500">★</span></span>
					{/if}
				</div>

				<h3 class="mt-1 line-clamp-1 text-[13px] font-extrabold leading-tight text-warm-800">{place.title}</h3>

				{#if place.address}
					<p class="mt-0.5 truncate text-[10px] text-warm-400">{place.address}</p>
				{/if}

				<p class="mt-0.5 line-clamp-2 h-[2.4em] text-[10px] leading-[1.2em] {contentIsNote ? 'italic text-brand-500' : contentPreview ? 'text-warm-500' : 'italic text-warm-300'}">
					{contentPreview ?? 'Add a note about this place...'}
				</p>

				<!-- Custom tags row -->
				<div bind:this={mobileTagContainerEl} class="relative mt-1.5">
					<!-- Hidden measurement row -->
					<div
						bind:this={mobileTagMeasureEl}
						class="pointer-events-none invisible absolute left-0 right-0 top-0 flex items-center gap-1"
						aria-hidden="true"
					>
						{#each userTags as tag (tag.id)}
							<span class="shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[8px] font-semibold">{tag.name}</span>
						{/each}
					</div>

					<!-- Visible tags -->
					<div class="flex flex-wrap items-center gap-1">
						{#each mobileDisplayTags as tag (tag.id)}
							<button
								onclick={() => onTagClick(tag.id)}
								oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onTagContextMenu?.(tag, e.clientX, e.clientY); }}
								class="rounded-full px-1.5 py-px text-[8px] font-semibold text-white hover:opacity-80"
								style="background-color: {tag.color ?? '#8a7e72'}"
							>{tag.name}</button>
						{/each}
						{#if !mobileTagsExpanded && mobileHiddenCount > 0}
							<button
								onclick={(e) => { e.stopPropagation(); mobileTagsExpanded = true; }}
								class="rounded-full bg-warm-100 px-1.5 py-px text-[8px] font-bold text-warm-500 hover:bg-warm-200 hover:text-warm-700"
							>+{mobileHiddenCount}</button>
						{:else if mobileTagsExpanded && mobileHiddenCount > 0}
							<button
								onclick={(e) => { e.stopPropagation(); mobileTagsExpanded = false; }}
								class="rounded-full bg-warm-100 px-1.5 py-px text-[8px] font-bold text-warm-500 hover:bg-warm-200 hover:text-warm-700"
							>less</button>
						{/if}
						{#if !place.enriched_at && place.url}
							<button
								onclick={() => onEnrich(place.id)}
								disabled={enrichingId === place.id}
								class="ml-auto text-[9px] font-semibold text-brand-600 disabled:opacity-50"
							>
								{enrichingId === place.id ? '...' : 'Enrich'}
							</button>
						{/if}
					</div>
				</div>

				<!-- Mobile action row: Maps | Website | Notes -->
				<div class="mt-1.5 flex items-center gap-1 border-t border-warm-100 pt-1.5">
					{#if place.url}
						<a
							href={place.url}
							target="_blank"
							class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Open in Google Maps"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
							</svg>
							Maps
						</a>
					{/if}
					{#if place.website}
						<a
							href={place.website}
							target="_blank"
							class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Website"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
							</svg>
							Website
						</a>
					{/if}
					<button
						onclick={flipToBack}
						class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
						aria-label="Notes"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
						</svg>
						Notes
					</button>
				</div>
			</article>
		</div>

		<!-- MOBILE BACK (Notes) -->
		<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
			<article class="flex h-full flex-col rounded-xl border border-warm-200 bg-white p-2.5">
				<div class="mb-1.5 flex items-center justify-between">
					<h3 class="line-clamp-1 flex-1 text-[13px] font-extrabold text-warm-800">{place.title}</h3>
					<div class="ml-2 flex items-center gap-1.5">
						{#if saving}
							<span class="text-[9px] text-warm-400">Saving...</span>
						{:else if saved}
							<span class="text-[9px] text-green-600">Saved</span>
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
					class="flex-1 w-full resize-none rounded-lg border border-warm-200 bg-warm-50 p-2 text-xs leading-relaxed text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
				></textarea>
			</article>
		</div>
	</div>
</div>

<!-- ============================================================ -->
<!-- DESKTOP LAYOUT (>= sm) — 3D flip animation                   -->
<!-- ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hidden sm:block [perspective:1000px]" onclick={handleFlip}>
	<div
		class="flip-inner relative transition-transform duration-500 [transform-style:preserve-3d]"
		class:is-flipped={flipped}
	>
		<!-- DESKTOP FRONT -->
		<div class="[backface-visibility:hidden]">
			<article class="group flex cursor-pointer flex-col rounded-2xl border border-warm-200 bg-white p-5 transition-all hover:shadow-md hover:shadow-warm-200/50">
				<div class="mb-3 flex items-center justify-between">
					<div class="flex flex-wrap items-center gap-1.5">
						{#if place.category}
							<span class="rounded-full bg-warm-200 px-2.5 py-0.5 text-[11px] font-bold text-warm-600">{place.category}</span>
						{/if}
						{#if place.area}
							<span class="rounded-full bg-sage-200 px-2 py-0.5 text-[11px] font-bold text-sage-700">{place.area}</span>
						{/if}
						{#if place.price_level}
							<span class="text-xs font-bold text-brand-600">{place.price_level}</span>
						{/if}
					</div>
					{#if place.rating}
						<div class="flex shrink-0 items-center gap-1">
							<span class="text-sm font-extrabold text-warm-800">{formatRating(place.rating)}</span>
							<span class="text-xs text-brand-500">★</span>
							{#if place.rating_count}
								<span class="text-[11px] text-warm-400">({place.rating_count.toLocaleString()})</span>
							{/if}
						</div>
					{/if}
				</div>

				<h3 class="mb-1 line-clamp-1 text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>

				<p class="mb-2.5 line-clamp-2 h-[2.6em] text-[13px] font-medium leading-[1.3em] {contentIsNote ? 'italic text-brand-500' : contentPreview ? 'text-warm-500' : 'italic text-warm-300'}">
					{contentPreview ?? 'Add a note about this place...'}
				</p>

				<p class="mb-3 line-clamp-1 text-xs font-medium leading-relaxed text-warm-400">
					{place.address ?? '\u00A0'}
				</p>

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
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
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
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Open in Google Maps"
						>
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
								<polyline points="15 3 21 3 21 9" />
								<line x1="10" y1="14" x2="21" y2="3" />
							</svg>
							Maps
						</a>
					{/if}
					{#if place.website}
						<a
							href={place.website}
							target="_blank"
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
							aria-label="Visit website"
						>
							<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="2" y1="12" x2="22" y2="12" />
								<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
							</svg>
							Website
						</a>
					{/if}
					<button
						onclick={flipToBack}
						class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-warm-400 hover:bg-warm-100 hover:text-warm-600"
						aria-label="Notes"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
						</svg>
						Notes
					</button>
					<div class="ml-auto">
						{#if confirmDelete}
							<button
								onclick={() => { onDelete(place.id); confirmDelete = false; }}
								class="rounded-md bg-red-100 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-200"
							>
								Confirm
							</button>
							<button onclick={() => { confirmDelete = false; }} class="ml-1 text-[11px] text-warm-400">Cancel</button>
						{:else}
							<button
								onclick={() => { confirmDelete = true; }}
								class="rounded-md p-2 text-warm-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
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

		<!-- DESKTOP BACK (Notes) -->
		<div class="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
			<article class="flex h-full flex-col rounded-2xl border border-warm-200 bg-white p-5">
				<div class="mb-3 flex items-center justify-between">
					<h3 class="line-clamp-1 text-base font-extrabold text-warm-800">{place.title}</h3>
					<div class="flex shrink-0 items-center gap-2">
						{#if saving}
							<span class="text-[11px] text-warm-400">Saving...</span>
						{:else if saved}
							<span class="text-[11px] text-green-600">Saved</span>
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
	.flip-card {
		cursor: pointer;
	}
	.is-flipped {
		transform: rotateY(180deg);
	}
</style>
