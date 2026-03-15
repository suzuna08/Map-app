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
		onTagsChanged
	}: Props = $props();

	let confirmDelete = $state(false);

	function formatRating(rating: number | null): string {
		if (!rating) return '';
		return rating.toFixed(1);
	}
</script>

<article class="group flex flex-col rounded-2xl border border-warm-200 bg-white p-4 transition-all hover:shadow-md hover:shadow-warm-200/50 sm:p-5">
	<!-- Top row: category + area + rating -->
	<div class="mb-3 flex items-center justify-between">
		<div class="flex flex-wrap items-center gap-1.5">
			{#if place.category}
			<span class="rounded-full bg-warm-200 px-2.5 py-0.5 text-[11px] font-bold text-warm-600">
				{place.category}
			</span>
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

	<!-- Title -->
	<h3 class="mb-1 line-clamp-1 text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>

	<!-- Description -->
	<p class="mb-2.5 line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-relaxed text-warm-500">
		{place.description ?? '\u00A0'}
	</p>

	<!-- Address -->
	<p class="mb-3 line-clamp-1 text-xs font-medium leading-relaxed text-warm-400">
		{place.address ?? '\u00A0'}
	</p>

	<!-- Tags -->
	<div class="mb-3">
		<TagInput
			{supabase}
			placeId={place.id}
			{userId}
			{allTags}
			{placeTags}
			onUpdate={onTagsChanged}
			onTagClick={onTagClick}
		/>
	</div>

	<!-- Actions row (pinned to bottom) -->
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
