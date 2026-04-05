<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import CollectionAvatar from './CollectionAvatar.svelte';

	interface Props {
		collections: Collection[];
		collectionPlacesMap: CollectionMemberMap;
		activeCollectionId: string | null;
		onSelect: (collectionId: string) => void;
		onClose: () => void;
	}

	let { collections, collectionPlacesMap, activeCollectionId, onSelect, onClose }: Props = $props();

	let searchText = $state('');

	let filtered = $derived(
		collections.filter((c) => {
			if (!searchText) return true;
			return c.name.toLowerCase().includes(searchText.toLowerCase());
		})
	);

	function handleSelect(id: string) {
		onSelect(id);
		onClose();
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
			<h2 class="text-sm font-bold text-warm-800">Switch collection</h2>
			<button
				onclick={onClose}
				class="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600"
				aria-label="Close"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		{#if collections.length > 5}
			<div class="border-b border-warm-100 px-4 py-2">
				<input
					type="text"
					bind:value={searchText}
					placeholder="Search collections..."
					class="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-1.5 text-sm font-medium text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
					autofocus
				/>
			</div>
		{/if}

		<div class="flex-1 overflow-y-auto px-2 py-2">
			{#each filtered as col (col.id)}
				{@const count = (collectionPlacesMap[col.id] ?? []).length}
				{@const isActive = col.id === activeCollectionId}
				<button
					onclick={() => handleSelect(col.id)}
					class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors {isActive ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-warm-50'}"
				>
					<CollectionAvatar color={col.color} emoji={col.emoji} size="sm" />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-bold {isActive ? 'text-brand-700' : 'text-warm-800'}">{col.name}</p>
						<p class="text-xs text-warm-400">{count} {count === 1 ? 'place' : 'places'}</p>
					</div>
					{#if isActive}
						<svg class="h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{/if}
				</button>
			{:else}
				<p class="py-6 text-center text-sm text-warm-400">No matching collections</p>
			{/each}
		</div>
	</div>
</div>
