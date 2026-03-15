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
	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));

	function formatRating(rating: number | null): string {
		if (!rating) return '';
		return rating.toFixed(1);
	}
</script>

<!-- ============ MOBILE LAYOUT (< sm) ============ -->
<article class="rounded-xl border border-warm-200 bg-white p-2.5 transition-all hover:shadow-sm sm:hidden">
	<!-- Row 1: badges + rating -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1">
			{#if place.category}
				<span class="rounded-full bg-warm-200 px-1.5 py-px text-[9px] font-bold text-warm-600">{place.category}</span>
			{/if}
			{#if place.area}
				<span class="rounded-full bg-sage-200 px-1.5 py-px text-[9px] font-bold text-sage-700">{place.area}</span>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			{#if place.rating}
				<span class="text-[11px] font-extrabold text-warm-700">{formatRating(place.rating)}<span class="text-brand-500">★</span></span>
			{/if}
			{#if place.url}
				<a href={place.url} target="_blank" class="text-warm-400 hover:text-warm-600" aria-label="Open in Google Maps">
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</a>
			{/if}
			{#if place.website}
				<a href={place.website} target="_blank" class="text-warm-400 hover:text-warm-600" aria-label="Website">
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
					</svg>
				</a>
			{/if}
		</div>
	</div>

	<!-- Row 2: title -->
	<h3 class="mt-1 line-clamp-1 text-[13px] font-extrabold leading-tight text-warm-800">{place.title}</h3>

	<!-- Row 3: address (if exists) -->
	{#if place.address}
		<p class="mt-0.5 truncate text-[10px] text-warm-400">{place.address}</p>
	{/if}

	<!-- Row 4: description (if exists, 1 line only) -->
	{#if place.description}
		<p class="mt-0.5 line-clamp-1 text-[10px] text-warm-500">{place.description}</p>
	{/if}

	<!-- Row 5: tags + actions (combined into one compact row) -->
	<div class="mt-1 flex items-center gap-1">
		{#each userTags.slice(0, 3) as tag (tag.id)}
			<button
				onclick={() => onTagClick(tag.id)}
				class="rounded-full px-1.5 py-px text-[8px] font-semibold text-white hover:opacity-80"
				style="background-color: {tag.color ?? '#8a7e72'}"
			>{tag.name}</button>
		{/each}
		{#if userTags.length > 3}
			<span class="text-[9px] font-bold text-warm-400">+{userTags.length - 3}</span>
		{/if}

		<div class="ml-auto flex items-center gap-1">
			{#if !place.enriched_at && place.url}
				<button
					onclick={() => onEnrich(place.id)}
					disabled={enrichingId === place.id}
					class="text-[9px] font-semibold text-brand-600 disabled:opacity-50"
				>
					{enrichingId === place.id ? '...' : 'Enrich'}
				</button>
			{/if}
		</div>
	</div>
</article>

<!-- ============ DESKTOP LAYOUT (>= sm) ============ -->
<article class="group hidden flex-col rounded-2xl border border-warm-200 bg-white p-5 transition-all hover:shadow-md hover:shadow-warm-200/50 sm:flex">
	<!-- Top row: category + area + rating -->
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

	<!-- Title -->
	<h3 class="mb-1 line-clamp-1 text-base font-extrabold leading-snug text-warm-800">{place.title}</h3>

	<!-- Description -->
	{#if place.description}
		<p class="mb-2.5 line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-relaxed text-warm-500">{place.description}</p>
	{:else}
		<div class="mb-2.5 min-h-[2.6em]"></div>
	{/if}

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

	<!-- Actions row -->
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
