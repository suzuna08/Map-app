<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';

	interface Props {
		placeId: string;
		placeTitle: string;
		collections: Collection[];
		collectionPlacesMap: CollectionMemberMap;
		onToggle: (placeId: string, collectionId: string) => void;
		onClose: () => void;
	}

	let { placeId, placeTitle, collections, collectionPlacesMap, onToggle, onClose }: Props = $props();

	function isInCollection(collectionId: string): boolean {
		return (collectionPlacesMap[collectionId] ?? []).includes(placeId);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onclick={onClose}>
	<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
	<div
		class="relative z-10 flex max-h-[70dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-sm sm:rounded-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3">
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-bold text-warm-800">Add to Collection</h2>
				<p class="truncate text-[11px] text-warm-400">{placeTitle}</p>
			</div>
			<button onclick={onClose} class="shrink-0 rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-2 py-2">
			{#if collections.length === 0}
				<div class="py-8 text-center">
					<p class="text-sm text-warm-400">No collections yet.</p>
					<a href="/collections" class="mt-1 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">Create one</a>
				</div>
			{:else}
				{#each collections as col (col.id)}
					{@const inCol = isInCollection(col.id)}
					{@const count = (collectionPlacesMap[col.id] ?? []).length}
					<button
						onclick={() => onToggle(placeId, col.id)}
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-warm-50"
					>
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
							style="background-color: {col.color ?? '#6366f1'}"
						>
							{#if inCol}
								<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{:else}
								<svg class="h-4 w-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
								</svg>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{col.name}</p>
							<p class="text-[11px] text-warm-400">{count} {count === 1 ? 'place' : 'places'}</p>
						</div>
						{#if inCol}
							<span class="shrink-0 text-[10px] font-bold text-sage-600">Added</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
