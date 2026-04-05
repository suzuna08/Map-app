<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import CollectionAvatar from './CollectionAvatar.svelte';
	import EmojiPicker from './EmojiPicker.svelte';

	interface Props {
		collection: Collection;
		collections: Collection[];
		collectionPlacesMap: CollectionMemberMap;
		filteredCount: number;
		totalCount: number;
		search: string;
		sortBy: string;
		viewMode: 'grid' | 'list';
		onSearchChange: (value: string) => void;
		onSortChange: (value: string) => void;
		onViewModeChange: (value: 'grid' | 'list') => void;
		onAddPlaces: () => void;
		onColorChange?: (color: string) => void;
		onEmojiChange?: (emoji: string | null) => void;
		onCopyShareLink?: () => void;
		onToggleSharing?: () => void;
		onNameChange?: (name: string) => void;
		onDescriptionChange?: (description: string) => void;
		onDeleteCollection?: () => void;
	}

	let {
		collection,
		collections,
		collectionPlacesMap,
		filteredCount,
		totalCount,
		search,
		sortBy,
		viewMode,
		onSearchChange,
		onSortChange,
		onViewModeChange,
		onAddPlaces,
		onColorChange,
		onEmojiChange,
		onCopyShareLink,
		onToggleSharing,
		onNameChange,
		onDescriptionChange,
		onDeleteCollection
	}: Props = $props();

	const COLORS = [
		'#A5834F', '#8C8B82', '#7489A6', '#936756', '#5B7D8A',
		'#6A6196'
	];

	let editingColor = $state(false);
	let colorPickerEl = $state<HTMLDivElement | null>(null);

	let editingName = $state(false);
	let editName = $state('');
	let editingDesc = $state(false);
	let editDesc = $state('');

	let overflowOpen = $state(false);
	let overflowEl = $state<HTMLDivElement | null>(null);
	let confirmDelete = $state(false);

	$effect(() => {
		if (!editingColor) return;
		function handler(e: MouseEvent) {
			if (colorPickerEl && !colorPickerEl.contains(e.target as Node)) editingColor = false;
		}
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});

	$effect(() => {
		if (!overflowOpen) { confirmDelete = false; return; }
		function handler(e: MouseEvent) {
			if (overflowEl && !overflowEl.contains(e.target as Node)) { overflowOpen = false; confirmDelete = false; }
		}
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});

	function saveName() {
		const trimmed = editName.trim();
		if (trimmed && trimmed !== collection.name && onNameChange) onNameChange(trimmed);
		editingName = false;
	}

	function saveDescription() {
		const val = editDesc.trim();
		if (val !== (collection.description ?? '') && onDescriptionChange) onDescriptionChange(val);
		editingDesc = false;
	}
</script>

<div class="border-b border-warm-200/80 bg-[#faf7f2]">
	<div class="px-3 sm:px-5 lg:px-6">
		<!-- Collection identity row -->
		<div class="flex items-center gap-2.5 pb-2 pt-2 sm:gap-3 sm:pb-2.5 sm:pt-2.5">
			<div class="relative" bind:this={colorPickerEl}>
				<button
					onclick={() => { editingColor = !editingColor; }}
					class="flex shrink-0 items-center justify-center rounded-full transition-all hover:scale-110"
					aria-label="Change collection color or icon"
				>
					<CollectionAvatar color={collection.color} emoji={collection.emoji} size="lg" />
				</button>
				{#if editingColor}
					<div class="absolute left-0 top-full z-20 mt-2 rounded-xl border border-warm-200 bg-white p-2.5 shadow-lg" style="width: max-content; max-width: 280px;">
						<div class="flex flex-wrap gap-1.5">
							{#each COLORS as color}
								<button
									onclick={() => { if (onColorChange) onColorChange(color); editingColor = false; }}
									class="h-5.5 w-5.5 rounded-full transition-all {collection.color === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
									style="background-color: {color}"
									aria-label="Select color"
								></button>
							{/each}
						</div>
						<div class="mt-2 border-t border-warm-100 pt-2">
							<span class="mb-1 block text-xs font-bold text-warm-400">Icon</span>
							<EmojiPicker selected={collection.emoji ?? null} onSelect={(em) => { if (onEmojiChange) onEmojiChange(em); }} />
						</div>
					</div>
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				{#if editingName}
					<input type="text" bind:value={editName} onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }} onblur={saveName} class="w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-base font-extrabold text-warm-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:text-lg" autofocus />
				{:else}
					<button type="button" class="cursor-pointer truncate text-left text-base font-extrabold text-warm-800 transition-colors hover:text-brand-600 sm:text-lg" onclick={() => { editingName = true; editName = collection.name; }}>{collection.name}</button>
				{/if}
				{#if editingDesc}
					<input type="text" bind:value={editDesc} onkeydown={(e) => { if (e.key === 'Enter') saveDescription(); if (e.key === 'Escape') editingDesc = false; }} onblur={saveDescription} placeholder="Add a description..." class="mt-0.5 w-full rounded-lg border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs text-warm-500 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20" autofocus />
				{:else}
					<div class="flex items-center gap-2 mt-0.5">
						<button type="button" class="cursor-pointer text-left text-xs text-warm-400 transition-colors hover:text-warm-500" onclick={() => { editingDesc = true; editDesc = collection.description ?? ''; }}>{collection.description || 'Add a description...'}</button>
					</div>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				{#if collection.visibility === 'link_access' && onCopyShareLink}
					<button
						onclick={onCopyShareLink}
						class="rounded-md p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
						aria-label="Copy share link"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
					</button>
				{/if}
				{#if onToggleSharing}
					<button
						onclick={onToggleSharing}
						class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-colors {collection.visibility === 'link_access' ? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100' : 'border-warm-200 text-warm-500 hover:bg-warm-50'}"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{#if collection.visibility === 'link_access'}<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />{:else}<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />{/if}</svg>
						{collection.visibility === 'link_access' ? 'Shared' : 'Private'}
					</button>
				{/if}
				<button
					onclick={onAddPlaces}
					class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span class="hidden sm:inline">Add Places</span>
				</button>
				<!-- Overflow menu -->
				<div class="relative" bind:this={overflowEl}>
					<button
						onclick={() => { overflowOpen = !overflowOpen; }}
						class="rounded-md p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
						aria-label="More actions"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
					</button>
					{#if overflowOpen}
					<div class="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-warm-200 bg-white py-1 shadow-lg">
						{#if onDeleteCollection}
								{#if confirmDelete}
									<div class="flex items-center gap-1.5 px-3 py-2">
										<button
											onclick={() => { onDeleteCollection(); overflowOpen = false; confirmDelete = false; }}
											class="rounded-md bg-danger-100 px-2 py-1 text-xs font-bold text-danger-700 hover:bg-danger-200"
										>Delete</button>
										<button
											onclick={() => { confirmDelete = false; }}
											class="text-xs text-warm-400 hover:text-warm-600"
										>Cancel</button>
									</div>
								{:else}
									<button
										onclick={() => { confirmDelete = true; }}
										class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
									>
										<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
										Delete collection
									</button>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Controls bar -->
	<div class="flex items-center justify-between border-t border-warm-200/60 px-3 py-1.5 sm:px-5 sm:py-2 lg:px-6">
		<span class="text-xs font-semibold text-warm-400">{totalCount} {totalCount === 1 ? 'place' : 'places'}</span>
		<div class="flex items-center gap-1.5 sm:gap-2">
			<div class="relative">
				<svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="text"
					value={search}
					oninput={(e) => onSearchChange((e.currentTarget as HTMLInputElement).value)}
					placeholder="Search..."
					class="w-28 rounded-lg border border-warm-200 bg-warm-50 py-1 pl-7 pr-7 text-xs font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20 sm:w-40 sm:text-sm"
				/>
				{#if search}
					<button
						onclick={() => onSearchChange('')}
						class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600"
						aria-label="Clear search"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				{/if}
			</div>
			<select
				value={sortBy}
				onchange={(e) => onSortChange((e.currentTarget as HTMLSelectElement).value)}
				class="rounded-md border border-warm-200 bg-white px-1.5 py-1 text-xs font-semibold text-warm-600 focus:border-brand-400 focus:outline-none sm:text-sm"
			>
				<option value="newest">Recent</option>
				<option value="az">A–Z</option>
				<option value="rating">My Rating</option>
			</select>
			<div class="flex items-center gap-0.5 rounded-md border border-warm-200 bg-white p-0.5">
				<button
					onclick={() => onViewModeChange('grid')}
					class="rounded p-1.5 transition-colors {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
					aria-label="Grid view"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
					</svg>
				</button>
				<button
					onclick={() => onViewModeChange('list')}
					class="rounded p-1.5 transition-colors {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
					aria-label="List view"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
						<line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>
