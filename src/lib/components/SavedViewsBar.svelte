<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Database, SavedView } from '$lib/types/database';
	import { updateSavedView, deleteSavedView } from '$lib/stores/saved-views.svelte';
	import { showToast } from '$lib/stores/toasts.svelte';
	import { sortable } from '$lib/actions/sortable';
	import { t } from '$lib/i18n/locale.svelte';

	let {
		supabase,
		userId,
		savedViews = [],
		activeSavedViewId = null,
		viewIsDirty = false,
		onApply,
		onViewsChanged,
		onQuickUpdate,
		onCreateCollection,
		onAddToCollection,
		onReorder
	}: {
		supabase: SupabaseClient<Database>;
		userId: string;
		savedViews: SavedView[];
		activeSavedViewId: string | null;
		viewIsDirty: boolean;
		onApply: (view: SavedView) => void;
		onViewsChanged: () => void;
		onQuickUpdate: () => void;
		onCreateCollection?: (view: SavedView) => void;
		onAddToCollection?: (view: SavedView) => void;
		onReorder?: (orderedIds: string[]) => void;
	} = $props();

	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let editInputEl = $state<HTMLInputElement | null>(null);

	let menuOpenId = $state<string | null>(null);
	let menuPos = $state({ x: 0, y: 0 });

	function startRename(view: SavedView) {
		editingId = view.id;
		editingName = view.name;
		menuOpenId = null;
		requestAnimationFrame(() => {
			editInputEl?.focus();
			editInputEl?.select();
		});
	}

	function cancelRename() {
		editingId = null;
		editingName = '';
	}

	async function handleRename() {
		const name = editingName.trim();
		if (!name || !editingId) { cancelRename(); return; }
		const ok = await updateSavedView(supabase, editingId, { name });
		if (ok) {
			showToast('success', '', 'View renamed');
			onViewsChanged();
		} else {
			showToast('error', '', 'Could not rename view');
		}
		cancelRename();
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleRename();
		} else if (e.key === 'Escape') {
			cancelRename();
		}
	}

	async function handleDelete(view: SavedView) {
		menuOpenId = null;
		const ok = await deleteSavedView(supabase, view.id);
		if (ok) {
			showToast('info', '', `"${view.name}" deleted`);
			onViewsChanged();
		} else {
			showToast('error', '', 'Could not delete view');
		}
	}

	function toggleMenu(viewId: string, e: MouseEvent) {
		if (menuOpenId === viewId) {
			menuOpenId = null;
			return;
		}
		const btn = (e.currentTarget as HTMLElement);
		const rect = btn.getBoundingClientRect();
		let x = rect.left;
		let y = rect.bottom + 4;
		const menuW = 176;
		if (x + menuW > window.innerWidth - 8) {
			x = window.innerWidth - menuW - 8;
		}
		if (x < 8) x = 8;
		menuPos = { x, y };
		menuOpenId = viewId;
	}

	function handleWindowClick(e: MouseEvent) {
		if (menuOpenId && !(e.target as HTMLElement)?.closest('[data-sv-menu]')) {
			menuOpenId = null;
		}
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && menuOpenId) {
			menuOpenId = null;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="mb-1.5 sm:mb-3">
	<div
		class="flex items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
		use:sortable={{
			onReorder: (ids) => onReorder?.(ids),
			itemSelector: '[data-view-id]',
			idAttribute: 'data-view-id',
			longPressMs: 500,
			disabled: !onReorder,
			ignoreDragFrom: '[data-sv-menu-btn]'
		}}
	>
		{#each savedViews as view (view.id)}
			{#if editingId === view.id}
				<input
					bind:this={editInputEl}
					bind:value={editingName}
					onkeydown={handleRenameKeydown}
					onblur={handleRename}
					class="shrink-0 rounded-lg border border-brand-400 bg-white px-2.5 py-1 text-xs font-semibold text-warm-800 outline-none ring-2 ring-brand-400/20 sm:px-3 sm:text-sm"
					style="width: {Math.max(editingName.length * 7.5 + 24, 72)}px"
				/>
			{:else}
				<div class="group relative shrink-0 select-none" data-sv-menu data-view-id={view.id}>
					<div class="inline-flex items-center rounded-lg border transition-all
						{activeSavedViewId === view.id
							? viewIsDirty
								? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-400/30 border-dashed'
								: 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-400/30'
							: 'border-warm-200 bg-white text-warm-600 hover:border-warm-300 hover:bg-warm-50'}">
						<button
							onclick={() => onApply(view)}
							class="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1 text-xs font-bold sm:pl-3 sm:text-sm"
						>
							<svg class="h-3 w-3 shrink-0 {activeSavedViewId === view.id ? 'text-brand-500' : 'text-warm-400'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
							</svg>
							{view.name}
							{#if activeSavedViewId === view.id && viewIsDirty}
								<span class="h-1.5 w-1.5 rounded-full bg-brand-500"></span>
							{/if}
						</button>
						<button
							data-sv-menu-btn
							onclick={(e) => { e.stopPropagation(); toggleMenu(view.id, e); }}
							class="flex items-center justify-center py-1 pr-1.5 pl-0.5 text-warm-300 transition-colors hover:text-warm-500 sm:pr-2"
							aria-label="View options for {view.name}"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
							</svg>
						</button>
					</div>
				</div>
			{/if}
		{/each}

	</div>
</div>

<!-- Popover dropdown menu -->
{#if menuOpenId}
	{@const view = savedViews.find((v) => v.id === menuOpenId)}
	{#if view}
		<div
			data-sv-menu
			class="fixed z-[60] w-44 rounded-lg border border-warm-200 bg-white py-1 shadow-lg"
			style="left: {menuPos.x}px; top: {menuPos.y}px;"
		>
			<button
				onclick={() => startRename(view)}
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-warm-600 hover:bg-warm-50 hover:text-warm-800"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
				</svg>
				{t('collections.rename')}
			</button>
			{#if onCreateCollection}
				<button
					onclick={(e) => { e.stopPropagation(); const v = view; menuOpenId = null; onCreateCollection!(v); }}
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-warm-600 hover:bg-warm-50 hover:text-warm-800"
				>
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					</svg>
					{t('collections.newCollection')}
				</button>
			{/if}
			{#if onAddToCollection}
				<button
					onclick={(e) => { e.stopPropagation(); const v = view; menuOpenId = null; onAddToCollection!(v); }}
					class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-warm-600 hover:bg-warm-50 hover:text-warm-800"
				>
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					{t('collections.addToCollection')}
				</button>
			{/if}
			<div class="my-1 border-t border-warm-100"></div>
			<button
				onclick={() => handleDelete(view)}
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-danger-600 hover:bg-danger-50 hover:text-danger-700"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
				{t('common.delete')}
			</button>
		</div>
	{/if}
{/if}
