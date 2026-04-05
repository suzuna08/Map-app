<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';

	interface Props {
		placeIds: string[];
		label: string;
		collections: Collection[];
		collectionPlacesMap: CollectionMemberMap;
		onToggle: (placeIds: string[], collectionId: string) => void;
		onClose: () => void;
	}

	let { placeIds, label, collections, collectionPlacesMap, onToggle, onClose }: Props = $props();

	let isBatch = $derived(placeIds.length > 1);

	function membershipInfo(collectionId: string): { allIn: boolean; someIn: boolean; count: number } {
		const members = collectionPlacesMap[collectionId] ?? [];
		let inCount = 0;
		for (const id of placeIds) {
			if (members.includes(id)) inCount++;
		}
		return { allIn: inCount === placeIds.length, someIn: inCount > 0, count: inCount };
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" onclick={onClose}>
	<div class="absolute inset-0 bg-warm-900/40 backdrop-blur-sm"></div>
	<div
		class="relative z-10 flex max-h-[70dvh] w-full flex-col rounded-t-2xl border border-warm-200 bg-white shadow-xl sm:max-w-sm sm:rounded-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<div class="flex items-center justify-between border-b border-warm-100 px-4 py-3">
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-bold text-warm-800">Add to Collection</h2>
				<p class="truncate text-xs text-warm-400">{label}</p>
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
					{@const info = membershipInfo(col.id)}
					{@const count = (collectionPlacesMap[col.id] ?? []).length}
					<button
						onclick={() => onToggle(placeIds, col.id)}
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-warm-50"
					>
						<div class="flex h-7 w-7 shrink-0 items-center justify-center">
							{#if info.allIn}
								<svg class="h-4 w-4 text-sage-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{:else}
							<CollectionAvatar color={col.color} emoji={col.emoji} size="xs" class={col.emoji ? '' : 'opacity-85'} />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold text-warm-800">{col.name}</p>
							<p class="text-xs text-warm-400">{count} {count === 1 ? 'place' : 'places'}</p>
						</div>
						{#if info.allIn}
							<span class="shrink-0 text-xs font-bold text-sage-600">All added</span>
						{:else if isBatch && info.someIn}
							<span class="shrink-0 text-xs font-bold text-warm-400">{info.count} already in</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
