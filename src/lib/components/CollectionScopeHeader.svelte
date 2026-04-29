<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import CollectionAvatar from './CollectionAvatar.svelte';
	import EmojiPicker from './EmojiPicker.svelte';

	interface Props {
		collection: Collection;
		collections: Collection[];
		collectionPlacesMap: CollectionMemberMap;
		totalCount: number;
		onAddPlaces: () => void;
		onColorChange?: (color: string) => void;
		onEmojiChange?: (emoji: string | null) => void;
		onCopyShareLink?: () => void;
		onSetVisibility?: (visibility: 'private' | 'link_access') => void;
		onShareSettingChange?: (field: 'share_notes' | 'share_photos' | 'share_tags', value: boolean) => void;
		onNameChange?: (name: string) => void;
		onDescriptionChange?: (description: string) => void;
		onDeleteCollection?: () => void;
	}

	let {
		collection,
		collections,
		collectionPlacesMap,
		totalCount,
		onAddPlaces,
		onColorChange,
		onEmojiChange,
		onCopyShareLink,
		onSetVisibility,
		onShareSettingChange,
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

	let shareDropdownOpen = $state(false);
	let shareDropdownEl = $state<HTMLDivElement | null>(null);

	let shareNotes = $derived(collection.share_notes ?? true);
	let sharePhotos = $derived(collection.share_photos ?? true);
	let shareTags = $derived(collection.share_tags ?? false);

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

	$effect(() => {
		if (!shareDropdownOpen) return;
		function handler(e: MouseEvent) {
			if (shareDropdownEl && !shareDropdownEl.contains(e.target as Node)) shareDropdownOpen = false;
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

	function handleShareButtonClick() {
		if (collection.visibility === 'link_access') {
			shareDropdownOpen = !shareDropdownOpen;
		} else if (onSetVisibility) {
			onSetVisibility('link_access');
		}
	}
</script>

<div class="border-b border-warm-200/80 bg-[#f2ede6]">
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
			{#if onSetVisibility}
				<div class="relative" bind:this={shareDropdownEl}>
					<button
						onclick={handleShareButtonClick}
						class="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-colors {collection.visibility === 'link_access' ? 'border-sage-200 bg-sage-50 text-sage-700 hover:bg-sage-100' : 'border-warm-200 text-warm-500 hover:bg-warm-50'}"
					>
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{#if collection.visibility === 'link_access'}<circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />{:else}<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />{/if}</svg>
						{collection.visibility === 'link_access' ? 'Shared' : 'Private'}
						{#if collection.visibility === 'link_access'}
							<svg class="h-2.5 w-2.5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9" /></svg>
						{/if}
					</button>
					{#if shareDropdownOpen && collection.visibility === 'link_access'}
						<div class="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-warm-200 bg-white shadow-lg">
							<!-- Copy link -->
							<button
								onclick={() => { if (onCopyShareLink) onCopyShareLink(); }}
								class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-warm-50"
							>
								<svg class="h-4 w-4 shrink-0 text-warm-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
								<span class="text-sm font-semibold text-warm-700">Copy link</span>
							</button>

							<div class="border-t border-warm-100"></div>

							<!-- Visible to others -->
							<div class="px-4 pt-3 pb-1">
								<p class="text-xs font-semibold text-warm-400">Visible to others</p>
							</div>

							<!-- Notes toggle -->
							<button
								onclick={() => { if (onShareSettingChange) onShareSettingChange('share_notes', !shareNotes); }}
								class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50"
							>
								<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
								<span class="flex-1 text-sm font-medium text-warm-700">Notes</span>
								<div class="relative h-5 w-9 rounded-full transition-colors {shareNotes ? 'bg-brand-500' : 'bg-warm-300'}">
									<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareNotes ? 'left-[18px]' : 'left-0.5'}"></div>
								</div>
							</button>

							<!-- Photos toggle -->
							<button
								onclick={() => { if (onShareSettingChange) onShareSettingChange('share_photos', !sharePhotos); }}
								class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50"
							>
								<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
								<span class="flex-1 text-sm font-medium text-warm-700">Photos</span>
								<div class="relative h-5 w-9 rounded-full transition-colors {sharePhotos ? 'bg-brand-500' : 'bg-warm-300'}">
									<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {sharePhotos ? 'left-[18px]' : 'left-0.5'}"></div>
								</div>
							</button>

							<!-- Tags toggle -->
							<button
								onclick={() => { if (onShareSettingChange) onShareSettingChange('share_tags', !shareTags); }}
								class="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-warm-50"
							>
								<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
								<span class="flex-1 text-sm font-medium text-warm-700">Tags</span>
								<div class="relative h-5 w-9 rounded-full transition-colors {shareTags ? 'bg-brand-500' : 'bg-warm-300'}">
									<div class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all {shareTags ? 'left-[18px]' : 'left-0.5'}"></div>
								</div>
							</button>

							<div class="border-t border-warm-100"></div>

							<!-- Turn off sharing -->
							<button
								onclick={() => { if (onSetVisibility) onSetVisibility('private'); shareDropdownOpen = false; }}
								class="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-danger-50"
							>
								<svg class="h-4 w-4 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
								<span class="text-sm font-semibold text-danger-600">Turn off sharing</span>
							</button>
						</div>
					{/if}
				</div>
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
</div>
