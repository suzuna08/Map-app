<script lang="ts">
	import type { Place, Tag } from '$lib/types/database';

	interface Props {
		place: Place;
		placeTags: Tag[];
		onTagClick: (tagId: string) => void;
	}

	let { place, placeTags, onTagClick }: Props = $props();

	let userTags = $derived(placeTags.filter((t) => t.source === 'user'));
</script>

<div class="flex items-center gap-4 rounded-xl border border-warm-200 bg-white px-4 py-3 transition-all hover:shadow-sm">
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<h3 class="truncate text-sm font-extrabold text-warm-800">{place.title}</h3>
			{#if place.category}
				<span class="hidden shrink-0 rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-bold text-warm-500 sm:inline">
					{place.category}
				</span>
			{/if}
		</div>
		{#if place.address}
			<p class="mt-0.5 truncate text-xs font-medium text-warm-400">{place.address}</p>
		{/if}
	</div>

	<div class="flex shrink-0 items-center gap-1.5">
		{#each userTags.slice(0, 3) as tag (tag.id)}
			<button
				onclick={() => onTagClick(tag.id)}
				class="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity hover:opacity-80"
				style="background-color: {tag.color ?? '#8a7e72'}"
			>
				{tag.name}
			</button>
		{/each}
		{#if userTags.length > 3}
			<span class="text-[10px] text-warm-400">+{userTags.length - 3}</span>
		{/if}
	</div>

	{#if place.rating}
		<div class="hidden shrink-0 items-center gap-0.5 sm:flex">
			<span class="text-xs font-extrabold text-warm-700">{place.rating.toFixed(1)}</span>
			<span class="text-[10px] text-brand-500">★</span>
		</div>
	{/if}

	{#if place.url}
		<a
			href={place.url}
			target="_blank"
			class="shrink-0 rounded-md p-1.5 text-warm-300 transition-colors hover:bg-warm-100 hover:text-warm-500"
			aria-label="Open in Google Maps"
		>
			<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				<polyline points="15 3 21 3 21 9" />
				<line x1="10" y1="14" x2="21" y2="3" />
			</svg>
		</a>
	{/if}
</div>
