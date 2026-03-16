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
		onTagClick: (tagId: string) => void;
		onTagContextMenu?: (tag: Tag, x: number, y: number) => void;
		onTagsChanged: () => void;
		onNoteChanged?: (placeId: string, note: string) => void;
		onDelete?: (placeId: string) => void;
	}

	let { place, placeTags, allTags, supabase, userId, onTagClick, onTagContextMenu, onTagsChanged, onNoteChanged, onDelete }: Props = $props();

	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));
	let firstTag = $derived(userTags[0] ?? null);
	let extraCount = $derived(Math.max(0, userTags.length - 1));
	let expanded = $state(false);
	let confirmDelete = $state(false);
	let noteText = $state(place.note ?? '');
	let saving = $state(false);
	let saved = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	function formatRating(r: number | null): string {
		return r ? r.toFixed(1) : '';
	}

	function toggleExpand(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('a, button, input, textarea')) return;
		expanded = !expanded;
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div>
	<!-- Compact row -->
	<div
		class="group flex h-10 cursor-pointer items-center gap-2 px-2.5 transition-colors hover:bg-warm-50/80 sm:h-11 sm:gap-3 sm:px-4"
		onclick={toggleExpand}
	>
		<!-- Expand chevron -->
		<svg
			class="h-3 w-3 shrink-0 text-warm-300 transition-transform duration-200 {expanded ? 'rotate-90' : ''}"
			viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
		>
			<polyline points="9 18 15 12 9 6" />
		</svg>

		<!-- Name -->
		<h3 class="min-w-0 flex-[2] truncate text-[12px] font-bold text-warm-800 sm:text-[13px]">{place.title}</h3>

		<!-- Area • Category (desktop) -->
		<div class="hidden shrink-0 items-center gap-1 text-[11px] sm:flex sm:w-44 lg:w-52">
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

		<!-- Category chip (mobile only) -->
		{#if place.category}
			<span class="shrink-0 truncate rounded-full bg-warm-100 px-1.5 py-px text-[8px] font-bold text-warm-500 sm:hidden">
				{place.category}
			</span>
		{/if}

		<!-- Rating -->
		<div class="w-9 shrink-0 text-right text-[11px] font-bold text-warm-500 sm:w-11 sm:text-xs">
			{#if place.rating}
				<span class="text-brand-500">★</span><span class="text-warm-700">{formatRating(place.rating)}</span>
			{/if}
		</div>

		<!-- Tag summary -->
		<div class="flex w-20 shrink-0 items-center gap-1 sm:w-28">
			{#if firstTag}
				<button
					onclick={() => onTagClick(firstTag.id)}
					oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); onTagContextMenu?.(firstTag, e.clientX, e.clientY); }}
					class="max-w-[72px] truncate rounded-full px-1.5 py-px text-[9px] font-semibold text-white hover:opacity-80 sm:max-w-[88px] sm:px-2 sm:text-[10px]"
					style="background-color: {firstTag.color ?? '#8a7e72'}"
				>{firstTag.name}</button>
				{#if extraCount > 0}
					<span class="text-[9px] font-bold text-warm-400 sm:text-[10px]">+{extraCount}</span>
				{/if}
			{:else}
				<span class="text-[10px] text-warm-300">—</span>
			{/if}
		</div>

		<!-- Hover actions -->
		<div class="flex w-14 shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:w-16">
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
				{#if confirmDelete}
					<button
						onclick={() => { onDelete(place.id); confirmDelete = false; }}
						class="rounded px-1 py-0.5 text-[9px] font-bold text-red-500 hover:bg-red-50"
					>Yes</button>
					<button onclick={() => { confirmDelete = false; }} class="rounded px-0.5 py-0.5 text-[9px] text-warm-400 hover:text-warm-600">No</button>
				{:else}
					<button
						onclick={() => { confirmDelete = true; }}
						class="rounded p-1 text-warm-300 transition-colors hover:bg-red-50 hover:text-red-500"
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
						<p class="text-[10px] font-bold uppercase tracking-wide text-warm-400">Notes</p>
						{#if saving}
							<span class="text-[9px] text-warm-400">Saving...</span>
						{:else if saved}
							<span class="text-[9px] text-green-600">Saved</span>
						{/if}
					</div>
					<textarea
						bind:value={noteText}
						oninput={scheduleAutoSave}
						onclick={(e) => e.stopPropagation()}
						placeholder="Add a note..."
						rows="2"
						class="w-full resize-none rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 text-xs leading-relaxed text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
					></textarea>
				</div>

				<!-- Tags -->
				<div class="flex-1">
					<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-warm-400">Tags</p>
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
