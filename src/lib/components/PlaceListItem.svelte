<script lang="ts">
	import type { Place, Tag } from '$lib/types/database';

	interface Props {
		place: Place;
		placeTags: Tag[];
		onTagClick: (tagId: string) => void;
	}

	let { place, placeTags, onTagClick }: Props = $props();

	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));
	let expanded = $state(false);
	let visibleTags = $derived(expanded ? userTags : userTags.slice(0, 3));
	let hiddenCount = $derived(userTags.length - 3);
</script>

<div class="rounded-lg border border-warm-200 bg-white px-2.5 py-1.5 transition-all hover:shadow-sm sm:rounded-xl sm:px-4 sm:py-3">
	<!-- Top: title + category + rating + link -->
	<div class="flex items-center gap-1 sm:gap-2">
		<h3 class="min-w-0 flex-1 truncate text-[13px] font-extrabold text-warm-800 sm:text-sm">{place.title}</h3>
		{#if place.category}
			<span class="shrink-0 rounded-full bg-warm-100 px-1.5 py-px text-[9px] font-bold text-warm-500 sm:px-2 sm:py-0.5 sm:text-[10px]">
				{place.category}
			</span>
		{/if}
		{#if place.rating}
			<span class="shrink-0 text-[10px] font-extrabold text-warm-700 sm:text-xs">{place.rating.toFixed(1)}<span class="text-brand-500">★</span></span>
		{/if}
		{#if place.url}
			<a
				href={place.url}
				target="_blank"
				class="shrink-0 text-warm-400 transition-colors hover:text-warm-600"
				aria-label="Open in Google Maps"
			>
				<svg class="h-3 w-3 sm:h-3.5 sm:w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					<polyline points="15 3 21 3 21 9" />
					<line x1="10" y1="14" x2="21" y2="3" />
				</svg>
			</a>
		{/if}
	</div>

	<!-- Address + area -->
	{#if place.address || place.area}
		<div class="mt-0.5 flex items-center gap-1.5 truncate">
			{#if place.area}
				<span class="shrink-0 text-[10px] font-semibold text-sage-500 sm:text-[11px]">{place.area}</span>
				{#if place.address}
					<span class="text-warm-300">·</span>
				{/if}
			{/if}
			{#if place.address}
				<p class="min-w-0 truncate text-[10px] font-medium text-warm-400 sm:text-xs">{place.address}</p>
			{/if}
		</div>
	{/if}

	<!-- Tags -->
	{#if userTags.length > 0}
		<div class="mt-1 flex flex-wrap items-center gap-1 sm:mt-1.5 sm:gap-1.5">
			{#each visibleTags as tag (tag.id)}
				<button
					onclick={() => onTagClick(tag.id)}
					class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white transition-opacity hover:opacity-80 sm:px-2 sm:text-[10px]"
					style="background-color: {tag.color ?? '#8a7e72'}"
				>
					{tag.name}
				</button>
			{/each}
			{#if hiddenCount > 0}
				<button
					onclick={() => { expanded = !expanded; }}
					class="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 sm:text-[10px]"
				>
					{expanded ? '−' : `+${hiddenCount}`}
				</button>
			{/if}
		</div>
	{/if}
</div>
