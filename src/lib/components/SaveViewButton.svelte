<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database, TagGroup } from '$lib/types/database';
	import { createSavedView, buildFiltersSnapshot } from '$lib/stores/saved-views.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';

	let {
		supabase,
		userId,
		selectedCustomIds = [],
		filterMode = 'all',
		selectedSource = 'all',
		sortBy = 'newest',
		viewMode = 'grid',
		search = '',
		onViewsChanged
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

{#if showCreateInput}
	<div class="flex shrink-0 items-center gap-1.5">
		<input
			bind:this={createInputEl}
			bind:value={newViewName}
			onkeydown={handleCreateKeydown}
			onblur={handleCreateBlur}
			placeholder="View name…"
			class="w-24 rounded-full border border-brand-300 bg-white px-3 py-2.5 text-xs font-medium text-warm-800 placeholder:text-warm-400 outline-none ring-2 ring-brand-400/20 focus:border-brand-400 sm:w-32 sm:py-3 sm:text-sm"
		/>
		<button
			onmousedown={(e) => e.preventDefault()}
			onclick={handleCreate}
			disabled={!newViewName.trim()}
			class="rounded-full bg-brand-500 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-600 disabled:opacity-40 sm:py-3 sm:text-sm"
		>
			Save
		</button>
		<button
			onmousedown={(e) => e.preventDefault()}
			onclick={cancelCreate}
			class="rounded-full px-2 py-2.5 text-xs font-medium text-warm-400 transition-colors hover:text-warm-600 sm:py-3"
		>
			Cancel
		</button>
	</div>
{:else}
	<button
		onclick={openCreate}
		class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warm-200/90 bg-warm-50 px-3 py-2.5 text-xs font-bold text-warm-500 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50/60 hover:text-brand-600 sm:px-4 sm:py-3 sm:text-sm"
		title={hasFilters ? 'Save current filters as a view' : 'Save a view'}
	>
		<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
		</svg>
		<span class="hidden sm:inline">Save View</span>
	</button>
{/if}
