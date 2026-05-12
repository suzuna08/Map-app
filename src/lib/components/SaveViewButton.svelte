<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database, TagGroup, SavedView } from '$lib/types/database';
	import { createSavedView, buildFiltersSnapshot } from '$lib/stores/saved-views.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';
	import { t } from '$lib/i18n/locale.svelte';

	let {
		supabase,
		userId,
		selectedCustomIds = [],
		filterMode = 'any',
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
	let newViewName = $state('');
	let createInputEl = $state<HTMLInputElement | null>(null);

	let hasFilters = $derived(
		selectedCustomIds.length > 0 ||
		selectedSource !== 'all' ||
		(search.trim() !== '' && !isGoogleMapsUrl(search))
	);

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
		showCreateInput = true;
		newViewName = '';
		requestAnimationFrame(() => createInputEl?.focus());
	}

	function cancelCreate() {
		showCreateInput = false;
		newViewName = '';
	}

	function handleCreateBlur() {
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
	}

	function handleCreateKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleCreate();
		} else if (e.key === 'Escape') {
			cancelCreate();
		}
	}
</script>

<!-- Bookmark button + create popover (unified for mobile and desktop) -->
<div class="relative shrink-0">
	<button
		onclick={openCreate}
		class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border p-1.5 text-xs font-semibold transition-colors sm:rounded-lg sm:px-2.5 sm:py-1.5 sm:text-sm
			{showCreateInput
				? 'border-brand-400 bg-brand-50 text-brand-600 ring-2 ring-brand-400/20'
				: 'border-warm-200 bg-white text-warm-500 hover:bg-warm-50 hover:text-warm-600'}"
		title={hasFilters ? 'Save current filters as a view' : 'Save a view'}
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
		</svg>
		<span class="hidden sm:inline">{t('bookmark.title')}</span>
	</button>

	{#if showCreateInput}
		<!-- Popover (same UI for both mobile and desktop) -->
		<button class="fixed inset-0 z-40" onclick={cancelCreate} aria-label="Close"></button>
		<div class="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-warm-200 bg-white p-3 shadow-lg">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-xs font-bold text-warm-700">{t('bookmark.title')}</span>
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
				placeholder={t('bookmark.placeholder')}
				class="mb-3 w-full rounded-md border border-warm-200 bg-warm-50 px-2.5 py-1.5 text-sm font-medium text-warm-800 placeholder:text-warm-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
			/>
			<div class="flex items-center gap-2">
				<button
					onmousedown={(e) => e.preventDefault()}
					onclick={cancelCreate}
					class="flex-1 rounded-md border border-warm-200 bg-white py-1.5 text-xs font-semibold text-warm-500 transition-colors hover:bg-warm-50"
				>
					{t('common.cancel')}
				</button>
				<button
					onmousedown={(e) => e.preventDefault()}
					onclick={handleCreate}
					disabled={!newViewName.trim()}
					class="flex-1 rounded-md bg-brand-500 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
				>
					{t('common.save')}
				</button>
			</div>
		</div>
	{/if}
</div>
