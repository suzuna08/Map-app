<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections, updateCollection } from '$lib/stores/collections.svelte';
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
		'#a8935f', '#bda87a', '#7c8a6a', '#617054', '#978a74',
		'#5a5042', '#98a485', '#b8c1a8', '#d0c09c', '#776841'
	];
	let selectedColor = $state(COLORS[0]);

	const OLD_TO_NEW: Record<string, string> = {
		'#6366f1': '#a8935f',
		'#8b5cf6': '#7c8a6a',
		'#ec4899': '#bda87a',
		'#f43f5e': '#d0c09c',
		'#f97316': '#978a74',
		'#eab308': '#776841',
		'#22c55e': '#98a485',
		'#14b8a6': '#617054',
		'#3b82f6': '#b8c1a8',
	};

	let migrated = false;

	async function migrateOldColors() {
		if (migrated) return;
		migrated = true;
		const colorsSet = new Set(COLORS);
		const toMigrate = collections.filter(
			(c) => c.color && !colorsSet.has(c.color) && OLD_TO_NEW[c.color]
		);
		if (toMigrate.length === 0) return;
		await Promise.all(
			toMigrate.map((c) => updateCollection(supabase, c.id, { color: OLD_TO_NEW[c.color!] }))
		);
		await refresh();
	}

	$effect(() => {
		if (collections.length > 0) migrateOldColors();
	});

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

	let editingColorId = $state<string | null>(null);
	let colorPickerEls = $state<Record<string, HTMLDivElement>>({});

	$effect(() => {
		if (!editingColorId) return;
		function onClickOutside(e: MouseEvent) {
			const el = colorPickerEls[editingColorId!];
			if (el && !el.contains(e.target as Node)) {
				editingColorId = null;
			}
		}
		document.addEventListener('click', onClickOutside, true);
		return () => document.removeEventListener('click', onClickOutside, true);
	});

	async function handleChangeColor(col: Collection, color: string) {
		if (color === col.color) { editingColorId = null; return; }
		const ok = await updateCollection(supabase, col.id, { color });
		if (ok) {
			collections = collections.map((c) => c.id === col.id ? { ...c, color } : c);
		}
		editingColorId = null;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>My Collections — MapOrganizer</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-8">
	<div class="mb-5 flex items-center justify-between sm:mb-8">
		<div>
			<h1 class="text-lg font-extrabold text-warm-800 sm:text-2xl">Collections</h1>
			<p class="mt-0.5 text-xs text-warm-400 sm:text-sm">Curated groups of your saved places</p>
		</div>
		<button
			onclick={() => { showCreate = true; }}
			class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm"
		>
			<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			New Collection
		</button>
	</div>

	{#if showCreate}
		<div class="mb-5 rounded-2xl border border-warm-200 bg-white p-4 sm:mb-8 sm:p-5">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
				<div class="flex-1">
					<label for="col-name" class="mb-1 block text-[11px] font-bold text-warm-500">Name</label>
					<input
						id="col-name"
						type="text"
						bind:value={newName}
						onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { showCreate = false; newName = ''; } }}
						placeholder="e.g. Weekend Brunch Spots"
						class="w-full rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm font-medium text-warm-800 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
						autofocus
					/>
				</div>
				<div>
					<label class="mb-1 block text-[11px] font-bold text-warm-500">Accent</label>
					<div class="flex items-center gap-1.5">
						{#each COLORS as color}
							<button
								onclick={() => { selectedColor = color; }}
								class="h-5.5 w-5.5 rounded-full transition-all sm:h-6 sm:w-6 {selectedColor === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'opacity-60 hover:opacity-100'}"
								style="background-color: {color}"
								aria-label="Select color {color}"
							></button>
						{/each}
					</div>
				</div>
			</div>
			<div class="mt-3.5 flex items-center gap-2 border-t border-warm-100 pt-3.5">
				<button
					onclick={handleCreate}
					disabled={!newName.trim() || creating}
					class="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-50 sm:text-sm"
				>
					{creating ? 'Creating...' : 'Create'}
				</button>
				<button
					onclick={() => { showCreate = false; newName = ''; }}
					class="rounded-lg px-3 py-1.5 text-xs font-medium text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 sm:text-sm"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if collections.length === 0 && !showCreate}
		<div class="py-20 text-center">
			<svg class="mx-auto h-10 w-10 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
			</svg>
			<p class="mt-3 text-sm font-medium text-warm-500">No collections yet</p>
			<button
				onclick={() => { showCreate = true; }}
				class="mt-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
			>
				Create your first collection
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
			{#each collections as col (col.id)}
				{@const count = (collectionPlacesMap[col.id] ?? []).length}
				<a
					href="/collections/{col.id}"
					class="group flex flex-col rounded-xl border border-warm-200 bg-white p-3.5 transition-all hover:shadow-md hover:shadow-warm-200/50 sm:rounded-2xl sm:p-5"
				>
					<div class="mb-2 flex items-center justify-between">
						<div class="flex items-center gap-1.5">
							{#if col.visibility === 'link_access'}
								<span class="rounded-full bg-sage-200 px-2 py-0.5 text-[10px] font-bold text-sage-700">Shared</span>
							{/if}
							<span class="text-[10px] font-medium text-warm-300">{formatDate(col.updated_at)}</span>
						</div>

						<div class="flex items-center gap-0.5">
							<div class="relative" bind:this={colorPickerEls[col.id]}>
								<button
									onclick={(e) => { e.preventDefault(); e.stopPropagation(); editingColorId = editingColorId === col.id ? null : col.id; }}
									class="rounded-md p-1.5 text-warm-300 opacity-0 transition-all hover:bg-warm-100 hover:text-warm-500 group-hover:opacity-100"
									aria-label="Change color"
								>
									<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.2-.3-.4-.6-.4-1 0-.9.8-1.7 1.7-1.7H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.5-10-9.5z" />
										<circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" /><circle cx="10" cy="7.5" r="1.5" fill="currentColor" /><circle cx="14" cy="7.5" r="1.5" fill="currentColor" /><circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" />
									</svg>
								</button>
								{#if editingColorId === col.id}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="absolute right-0 top-full z-30 mt-1.5 flex flex-wrap gap-1.5 rounded-xl border border-warm-200 bg-white p-2.5 shadow-lg"
										style="width: max-content; max-width: 175px;"
										onclick={(e) => { e.preventDefault(); e.stopPropagation(); }}
									>
										{#each COLORS as color}
											<button
												onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleChangeColor(col, color); }}
												class="h-5.5 w-5.5 rounded-full transition-all {col.color === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'opacity-60 hover:opacity-100'}"
												style="background-color: {color}"
												aria-label="Select color {color}"
											></button>
										{/each}
									</div>
								{/if}
							</div>
							<button
								onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(col); }}
								class="rounded-md p-1.5 text-warm-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
								aria-label="Delete collection"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					</div>

					<div class="flex items-center gap-2.5">
						<div
							class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full sm:h-[18px] sm:w-[18px]"
							style="background-color: {col.color ?? '#a8935f'}"
						></div>
						<h3 class="min-w-0 truncate text-sm font-extrabold leading-snug text-warm-800 sm:text-base">{col.name}</h3>
					</div>

					{#if col.description}
						<p class="mt-1.5 line-clamp-2 text-xs font-medium text-warm-400">{col.description}</p>
					{/if}

					<div class="mt-auto flex items-center gap-2 pt-3">
						<span class="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-bold text-warm-500">{count} {count === 1 ? 'place' : 'places'}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

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
