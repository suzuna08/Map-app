<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database, TagGroup, SavedView } from '$lib/types/database';
	import { createSavedView, buildFiltersSnapshot } from '$lib/stores/saved-views.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';
	import { onMount } from 'svelte';

	let {
		supabase,
		userId,
		selectedCustomIds = [],
		filterMode = 'all',
		selectedSource = 'all',
		sortBy = 'newest',
		viewMode = 'grid',
		search = '',
		onViewsChanged,
		onCreateStart,
		savedViews = [],
		activeSavedViewId = null,
		viewIsDirty = false,
		onApply
	}: {
		supabase: SupabaseClient<Database>;
		userId: string;
		selectedCustomIds: string[];
		filterMode: 'all' | 'any';
		selectedSource: string;
		sortBy: string;
		viewMode: string;
		search: string;
		onViewsChanged: () => void;
		onCreateStart?: () => void;
		savedViews?: SavedView[];
		activeSavedViewId?: string | null;
		viewIsDirty?: boolean;
		onApply?: (view: SavedView) => void;
	} = $props();

	let showCreateInput = $state(false);
	let showMobileSheet = $state(false);
	let newViewName = $state('');
	let createInputEl = $state<HTMLInputElement | null>(null);
	let isMobile = $state(false);

	onMount(() => {
		const mql = window.matchMedia('(max-width: 1023px)');
		isMobile = mql.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});

	let hasFilters = $derived(
		selectedCustomIds.length > 0 ||
		selectedSource !== 'all' ||
		(search.trim() !== '' && !isGoogleMapsUrl(search))
	);

	let hasActiveView = $derived(activeSavedViewId !== null);

	function isGoogleMapsUrl(text: string): boolean {
		const t = text.trim();
		return /^https?:\/\/(maps\.google\.|www\.google\.\w+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|share\.google\/)/i.test(t);
	}

	function getSearchTextForSnapshot(): string | undefined {
		const trimmed = search.trim();
		return (trimmed && !isGoogleMapsUrl(trimmed)) ? trimmed : undefined;
	}

	function openCreate() {
		onCreateStart?.();
		if (isMobile) {
			showMobileSheet = true;
			showCreateInput = true;
			newViewName = '';
			requestAnimationFrame(() => createInputEl?.focus());
		} else {
			showCreateInput = true;
			newViewName = '';
			requestAnimationFrame(() => createInputEl?.focus());
		}
	}

	function openMobileSheet() {
		showMobileSheet = true;
		showCreateInput = false;
		newViewName = '';
	}

	function closeMobileSheet() {
		showMobileSheet = false;
		showCreateInput = false;
		newViewName = '';
	}

	function cancelCreate() {
		if (isMobile) {
			showCreateInput = false;
			newViewName = '';
		} else {
			showCreateInput = false;
			newViewName = '';
		}
	}

	function handleCreateBlur() {
		if (isMobile) return;
		setTimeout(() => {
			if (!newViewName.trim()) {
				cancelCreate();
			}
		}, 150);
	}

	async function handleCreate() {
		const name = newViewName.trim();
		if (!name) { cancelCreate(); return; }
		const tg: TagGroup[] = selectedCustomIds.length > 0
			? [{ id: '0', tagIds: [...selectedCustomIds], mode: filterMode }]
			: [];
		const searchText = getSearchTextForSnapshot();
		const filters = buildFiltersSnapshot(selectedCustomIds, selectedSource, tg, searchText);
		const result = await createSavedView(supabase, userId, name, filters, sortBy, viewMode);
		if (result) {
			showToast('success', '', `Saved view "${name}" created`);
			onViewsChanged();
		} else {
			showToast('error', '', 'Could not save view. Make sure the saved_views table exists.');
		}
		showCreateInput = false;
		newViewName = '';
		if (isMobile) showMobileSheet = false;
	}

	function handleCreateKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleCreate();
		} else if (e.key === 'Escape') {
			cancelCreate();
		}
	}

	function handleApplyView(view: SavedView) {
		onApply?.(view);
		closeMobileSheet();
	}
</script>

{#if showMobileSheet && isMobile}
	<!-- Mobile: bottom sheet with saved views list + create -->
	<div class="fixed inset-0 z-50 bg-black/30" onclick={closeMobileSheet} role="presentation"></div>
	<div class="fixed bottom-0 left-0 right-0 z-50 flex max-h-[70dvh] flex-col rounded-t-2xl bg-white shadow-xl">
		<div class="flex items-center justify-between border-b border-warm-100 px-5 pt-4 pb-3">
			<h3 class="text-sm font-bold text-warm-800">Bookmarks</h3>
			<button
				onclick={closeMobileSheet}
				class="rounded-full p-1 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
				aria-label="Close"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-4 py-3">
			{#if savedViews.length > 0}
				<div class="flex flex-col gap-1">
					{#each savedViews as view (view.id)}
						<button
							onclick={() => handleApplyView(view)}
							class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors
								{activeSavedViewId === view.id
									? 'bg-brand-50 text-brand-700'
									: 'text-warm-700 active:bg-warm-50'}"
						>
							<svg class="h-4 w-4 shrink-0 {activeSavedViewId === view.id ? 'text-brand-500' : 'text-warm-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
							</svg>
							<span class="flex-1 truncate text-sm font-semibold">{view.name}</span>
							{#if activeSavedViewId === view.id}
								<svg class="h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
									<polyline points="20 6 9 17 4 12" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			{:else}
				<p class="py-4 text-center text-sm text-warm-400">No bookmarks yet</p>
			{/if}
		</div>

		<div class="border-t border-warm-100 px-5 pt-3 pb-8">
			{#if showCreateInput}
				<input
					bind:this={createInputEl}
					bind:value={newViewName}
					onkeydown={handleCreateKeydown}
					placeholder="Bookmark name…"
					class="mb-3 w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2.5 text-sm font-medium text-warm-800 placeholder:text-warm-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
				/>
				<div class="flex items-center gap-3">
					<button
						onmousedown={(e) => e.preventDefault()}
						onclick={cancelCreate}
						class="flex-1 rounded-lg border border-warm-200 bg-white py-2.5 text-sm font-semibold text-warm-500 transition-colors hover:bg-warm-50"
					>
						Cancel
					</button>
					<button
						onmousedown={(e) => e.preventDefault()}
						onclick={handleCreate}
						disabled={!newViewName.trim()}
						class="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
					>
						Save
					</button>
				</div>
			{:else}
				<button
					onclick={openCreate}
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 py-2.5 text-sm font-semibold text-warm-500 transition-colors active:bg-warm-50"
				>
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					New bookmark
				</button>
			{/if}
		</div>
	</div>
{/if}
<!-- Desktop: bookmark button + popover; Mobile: button opens bottom sheet -->
<div class="relative shrink-0">
	<button
		onclick={() => { isMobile ? openMobileSheet() : openCreate(); }}
		class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border p-1.5 text-xs font-semibold transition-colors sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-sm
			{hasActiveView && isMobile
				? 'border-brand-400 bg-brand-50 text-brand-600'
				: showCreateInput && !isMobile
					? 'border-brand-400 bg-brand-50 text-brand-600 ring-2 ring-brand-400/20'
					: 'border-warm-200 bg-white text-warm-500 hover:bg-warm-50 hover:text-warm-600'}"
		title={hasFilters ? 'Save current filters as a view' : 'Save a view'}
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
		</svg>
		<span class="hidden sm:inline">Bookmark</span>
	</button>
	{#if showCreateInput && !isMobile}
		<!-- Desktop: non-modal popover -->
		<div class="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-warm-200 bg-white p-3 shadow-lg">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-xs font-bold text-warm-700">Bookmark</span>
				<button
					onclick={cancelCreate}
					class="rounded-full p-0.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
					aria-label="Close"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
			<input
				bind:this={createInputEl}
				bind:value={newViewName}
				onkeydown={handleCreateKeydown}
				onblur={handleCreateBlur}
				placeholder="Bookmark name…"
				class="mb-3 w-full rounded-md border border-warm-200 bg-warm-50 px-2.5 py-1.5 text-sm font-medium text-warm-800 placeholder:text-warm-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
			/>
			<div class="flex items-center gap-2">
				<button
					onmousedown={(e) => e.preventDefault()}
					onclick={cancelCreate}
					class="flex-1 rounded-md border border-warm-200 bg-white py-1.5 text-xs font-semibold text-warm-500 transition-colors hover:bg-warm-50"
				>
					Cancel
				</button>
				<button
					onmousedown={(e) => e.preventDefault()}
					onclick={handleCreate}
					disabled={!newViewName.trim()}
					class="flex-1 rounded-md bg-brand-500 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
				>
					Save
				</button>
			</div>
		</div>
	{/if}
</div>
