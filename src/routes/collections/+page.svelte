<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections } from '$lib/stores/collections.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let collections = $state<Collection[]>((data as any).collections ?? []);
	let collectionPlacesMap = $state<CollectionMemberMap>((data as any).collectionPlacesMap ?? {});
	let toasts = $derived(getToasts());

	let showCreate = $state(false);
	let newName = $state('');
	let creating = $state(false);

	const COLORS = [
		'#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
		'#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#a8935f'
	];
	let selectedColor = $state(COLORS[0]);

	async function refresh() {
		const result = await loadCollections(supabase);
		collections = result.collections;
		collectionPlacesMap = result.collectionPlacesMap;
	}

	async function handleCreate() {
		const trimmed = newName.trim();
		if (!trimmed || creating) return;
		creating = true;

		const col = await createCollection(supabase, session?.user?.id ?? '', trimmed, { color: selectedColor });
		if (col) {
			showToast('success', '', `Created "${trimmed}"`);
			newName = '';
			showCreate = false;
			selectedColor = COLORS[0];
			await refresh();
		} else {
			showToast('error', '', 'Could not create collection');
		}
		creating = false;
	}

	async function handleDelete(col: Collection) {
		const ok = await deleteCollection(supabase, col.id);
		if (ok) {
			showToast('info', '', `Deleted "${col.name}"`);
			await refresh();
		} else {
			showToast('error', '', 'Could not delete collection');
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>My Collections — MapOrganizer</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-8">
	<!-- Header -->
	<div class="mb-4 flex items-center justify-between sm:mb-6">
		<div>
			<h1 class="text-xl font-extrabold text-warm-800 sm:text-2xl">My Collections</h1>
			<p class="mt-0.5 text-xs text-warm-400 sm:text-sm">Curated groups of your saved places</p>
		</div>
		<button
			onclick={() => { showCreate = true; }}
			class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:px-4 sm:py-2 sm:text-sm"
		>
			<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			New Collection
		</button>
	</div>

	<!-- Create form -->
	{#if showCreate}
		<div class="mb-4 rounded-xl border border-brand-200 bg-brand-50/50 p-3 sm:mb-6 sm:p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="flex-1">
					<label for="col-name" class="mb-1 block text-xs font-bold text-warm-600">Name</label>
					<input
						id="col-name"
						type="text"
						bind:value={newName}
						onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { showCreate = false; newName = ''; } }}
						placeholder="e.g. Weekend Brunch Spots"
						class="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm font-medium text-warm-800 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
						autofocus
					/>
				</div>
				<div>
					<label class="mb-1 block text-xs font-bold text-warm-600">Color</label>
					<div class="flex items-center gap-1.5">
						{#each COLORS as color}
							<button
								onclick={() => { selectedColor = color; }}
								class="h-6 w-6 rounded-full transition-all sm:h-7 sm:w-7 {selectedColor === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'opacity-70 hover:opacity-100'}"
								style="background-color: {color}"
								aria-label="Select color {color}"
							></button>
						{/each}
					</div>
				</div>
			</div>
			<div class="mt-3 flex items-center gap-2">
				<button
					onclick={handleCreate}
					disabled={!newName.trim() || creating}
					class="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:text-sm"
				>
					{creating ? 'Creating...' : 'Create'}
				</button>
				<button
					onclick={() => { showCreate = false; newName = ''; }}
					class="rounded-lg px-3 py-1.5 text-xs font-medium text-warm-500 transition-colors hover:bg-warm-100 sm:text-sm"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	<!-- Collections grid -->
	{#if collections.length === 0 && !showCreate}
		<div class="py-20 text-center">
			<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
			</svg>
			<p class="mt-3 text-sm text-warm-500">No collections yet</p>
			<button
				onclick={() => { showCreate = true; }}
				class="mt-2 text-sm font-semibold text-brand-600 hover:text-brand-700"
			>
				Create your first collection
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			{#each collections as col (col.id)}
				{@const count = (collectionPlacesMap[col.id] ?? []).length}
				<a
					href="/collections/{col.id}"
					class="group relative flex flex-col rounded-xl border border-warm-200 bg-white p-4 transition-all hover:shadow-md hover:shadow-warm-200/50 sm:rounded-2xl sm:p-5"
				>
					<!-- Color accent bar -->
					<div
						class="absolute left-0 top-0 h-full w-1 rounded-l-xl sm:rounded-l-2xl"
						style="background-color: {col.color ?? '#6366f1'}"
					></div>

					<div class="flex items-start justify-between">
						<div class="flex items-center gap-2.5">
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white sm:h-10 sm:w-10"
								style="background-color: {col.color ?? '#6366f1'}"
							>
								<svg class="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
								</svg>
							</div>
							<div>
								<h3 class="text-sm font-extrabold text-warm-800 sm:text-base">{col.name}</h3>
								<p class="text-[11px] text-warm-400">{count} {count === 1 ? 'place' : 'places'}</p>
							</div>
						</div>

						<div class="flex items-center gap-1">
							{#if col.visibility === 'link_access'}
								<span class="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold text-sage-600">Shared</span>
							{/if}
							<button
								onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(col); }}
								class="rounded-lg p-1.5 text-warm-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
								aria-label="Delete collection"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					</div>

					{#if col.description}
						<p class="mt-2 line-clamp-2 text-xs text-warm-500">{col.description}</p>
					{/if}

					<p class="mt-auto pt-2 text-[10px] text-warm-300">Updated {formatDate(col.updated_at)}</p>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- Toasts -->
{#if toasts.length > 0}
	<div class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8">
		{#each toasts as toast (toast.id)}
			<div
				class="flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in
					{toast.type === 'success' ? 'border border-sage-200/60 bg-sage-50/95 text-sage-800' : ''}
					{toast.type === 'error' ? 'border border-red-200/60 bg-red-50/95 text-red-700' : ''}
					{toast.type === 'info' ? 'border border-blue-200/60 bg-blue-50/95 text-blue-800' : ''}"
			>
				<span class="text-xs font-medium sm:text-sm">{toast.message}</span>
				{#if toast.actions}
					{#each toast.actions as action}
						<button
							onclick={() => { action.handler(); dismissToast(toast.id); }}
							class="text-[10px] font-bold underline sm:text-xs"
						>{action.label}</button>
					{/each}
				{/if}
			</div>
		{/each}
	</div>
{/if}
