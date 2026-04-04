<script lang="ts">
	import type { Collection } from '$lib/types/database';
	import { createCollection, deleteCollection, loadCollections, updateCollection } from '$lib/stores/collections.svelte';
	import type { CollectionMemberMap } from '$lib/stores/collections.svelte';
	import { showToast, getToasts, dismissToast } from '$lib/stores/toasts.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import CollectionAvatar from '$lib/components/CollectionAvatar.svelte';

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
		'#A5834F', '#8C8B82', '#7489A6', '#936756', '#5B7D8A',
		'#6A6196'
	];
	let selectedColor = $state(COLORS[0]);

	let selectedEmoji = $state<string | null>(null);

	const OLD_TO_NEW: Record<string, string> = {
		'#6366f1': '#6A6196',
		'#8b5cf6': '#6A6196',
		'#ec4899': '#936756',
		'#f43f5e': '#936756',
		'#f97316': '#A5834F',
		'#eab308': '#A5834F',
		'#22c55e': '#8C8B82',
		'#14b8a6': '#5B7D8A',
		'#3b82f6': '#7489A6',
		'#7c8a6a': '#8C8B82',
		'#617054': '#8C8B82',
		'#98a485': '#8C8B82',
		'#b8c1a8': '#8C8B82',
		'#637d8e': '#5B7D8A',
		'#4d6575': '#5B7D8A',
		'#7e95a6': '#7489A6',
		'#a3b3c0': '#7489A6',
		'#a8935f': '#A5834F',
		'#bda87a': '#A5834F',
		'#978a74': '#8C8B82',
		'#5a5042': '#936756',
		'#d0c09c': '#A5834F',
		'#776841': '#A5834F',
		'#8888b0': '#6A6196',
		'#8a6a38': '#A5834F',
		'#8a5848': '#936756',
		'#6b5244': '#936756',
		'#605080': '#6A6196',
		'#4a3830': '#936756',
		'#354050': '#5B7D8A',
		'#4d8090': '#5B7D8A',
		'#3a6868': '#5B7D8A',
		'#654830': '#A5834F',
		'#504068': '#6A6196',
		'#4a7880': '#5B7D8A',
		'#c0a060': '#A5834F',
		'#a8a0b8': '#6A6196',
		'#b09060': '#A5834F',
		'#a88040': '#A5834F',
		'#8a8880': '#8C8B82',
		'#6888a8': '#7489A6',
		'#9a6050': '#936756',
		'#6858a0': '#6A6196',
		'#5a4a40': '#936756',
		'#2e4050': '#5B7D8A',
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
		collections = collections.map((c) => {
			const newColor = c.color && OLD_TO_NEW[c.color];
			return newColor ? { ...c, color: newColor } : c;
		});
		Promise.all(
			toMigrate.map((c) => updateCollection(supabase, c.id, { color: OLD_TO_NEW[c.color!] }))
		);
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
		const col = await createCollection(supabase, session?.user?.id ?? '', trimmed, { color: selectedColor, emoji: selectedEmoji ?? undefined });
		if (col) {
			showToast('success', '', `Created "${trimmed}"`);
			newName = '';
			showCreate = false;
			selectedColor = COLORS[0];
			selectedEmoji = null;
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

	let confirmDeleteId = $state<string | null>(null);

	// Swipe-to-delete state (mobile)
	let swipeId = $state<string | null>(null);
	let swipeX = $state(0);
	let swiping = $state(false);
	let swipeConfirm = $state(false);
	let startX = 0;
	let startY = 0;
	let locked = false;
	const DELETE_WIDTH = 72;
	const SNAP_THRESHOLD = 36;

	function onTouchStart(id: string, e: TouchEvent) {
		const t = e.touches[0];
		startX = t.clientX;
		startY = t.clientY;
		locked = false;
		swiping = false;
		if (swipeId !== id) {
			swipeId = id;
			swipeX = 0;
			swipeConfirm = false;
		}
	}

	function onTouchMove(e: TouchEvent) {
		const t = e.touches[0];
		const dx = t.clientX - startX;
		const dy = t.clientY - startY;

		if (!locked) {
			if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
				locked = true;
				return;
			}
			if (Math.abs(dx) > 5) swiping = true;
		}
		if (locked || !swiping) return;

		e.preventDefault();
		swipeX = Math.max(-DELETE_WIDTH, Math.min(0, dx));
	}

	function onTouchEnd() {
		swiping = false;
		const snapped = swipeX < -SNAP_THRESHOLD ? -DELETE_WIDTH : 0;
		if (snapped === 0) { swipeConfirm = false; }
		swipeX = snapped;
	}

	function handleSwipeDelete(col: Collection, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!swipeConfirm) {
			swipeConfirm = true;
			return;
		}
		swipeX = 0;
		swipeConfirm = false;
		swipeId = null;
		handleDelete(col);
	}

	async function handleChangeEmoji(col: Collection, emoji: string | null) {
		collections = collections.map((c) => c.id === col.id ? { ...c, emoji } : c);
		const ok = await updateCollection(supabase, col.id, { emoji });
		if (!ok) {
			collections = collections.map((c) => c.id === col.id ? { ...c, emoji: col.emoji } : c);
			showToast('error', '', 'Could not save icon — have you run the emoji migration?');
		}
	}

</script>

<svelte:head>
	<title>My Collections — MapOrganizer</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-8">
	<div class="mb-5 flex items-start justify-between gap-3 sm:mb-8 sm:items-center">
		<h1 class="text-xl font-extrabold text-warm-800 sm:text-2xl">Collections</h1>
		<button
			onclick={() => { showCreate = true; }}
			class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm"
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
					<label for="col-name" class="mb-1 block text-xs font-bold text-warm-500">Name</label>
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
					<label class="mb-1 block text-xs font-bold text-warm-500">Accent</label>
					<div class="flex items-center gap-1.5">
						{#each COLORS as color}
							<button
								onclick={() => { selectedColor = color; }}
								class="h-5.5 w-5.5 rounded-full transition-all sm:h-6 sm:w-6 {selectedColor === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
								style="background-color: {color}"
								aria-label="Select color"
							></button>
						{/each}
					</div>
				</div>
				<div>
				<label class="mb-1 block text-xs font-bold text-warm-500">Icon</label>
				<EmojiPicker selected={selectedEmoji} onSelect={(em) => { selectedEmoji = em; }} />
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
			<p class="mt-3 text-[15px] font-medium text-warm-500">No collections yet</p>
			<button
				onclick={() => { showCreate = true; }}
				class="mt-1.5 text-[15px] font-semibold text-brand-600 hover:text-brand-700"
			>
				Create your first collection
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4">
			{#each collections as col (col.id)}
				{@const count = (collectionPlacesMap[col.id] ?? []).length}
				<!-- Mobile: swipe-to-delete wrapper (delete layer always behind card, like PlaceListItem) -->
				<div
					class="relative h-[96px] w-full shrink-0 overflow-hidden rounded-xl border border-warm-200/80 bg-danger-500 sm:hidden"
				>
					<button
						onclick={(e) => handleSwipeDelete(col, e)}
						class="absolute right-0 top-0 flex h-full w-[72px] flex-col items-center justify-center gap-0.5 rounded-r-[11px] text-white transition-colors {swipeConfirm ? 'bg-danger-600' : 'bg-transparent'}"
						aria-label={swipeConfirm ? 'Confirm delete' : 'Delete collection'}
					>
						{#if swipeConfirm}
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
							<span class="text-[10px] font-bold">Confirm?</span>
						{:else}
							<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
						{/if}
					</button>

					<a
						href="/collections/{col.id}"
						class="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[11px] bg-white transition-all active:bg-warm-50/80"
						style="transform: translateX({swipeId === col.id ? swipeX : 0}px); transition: {swiping && swipeId === col.id ? 'none' : 'transform 0.2s ease-out'}"
						onclick={(e) => { if (swipeId === col.id && swipeX < 0) { e.preventDefault(); swipeX = 0; swipeConfirm = false; } }}
						ontouchstart={(e) => onTouchStart(col.id, e)}
						ontouchmove={onTouchMove}
						ontouchend={onTouchEnd}
					>
						<div class="relative flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
							<div class="flex min-h-0 flex-1 items-center">
								<div class="flex min-w-0 items-center gap-2.5">
									<div class="flex shrink-0">
										<CollectionAvatar color={col.color} emoji={col.emoji} size="sm" />
									</div>
									<div class="min-h-0 min-w-0 flex-1 overflow-hidden">
										<h3 class="truncate text-[15px] font-extrabold leading-tight text-warm-800">{col.name}</h3>
										{#if col.description}
											<p class="mt-0.5 line-clamp-1 text-[11px] font-medium leading-4 text-warm-500">{col.description}</p>
										{/if}
									</div>
								</div>
							</div>
							<div class="flex shrink-0 flex-wrap items-center gap-1.5">
								<span
									class="inline-flex h-5 w-fit items-center rounded-full bg-warm-100/90 px-2 text-[10px] font-bold leading-none text-warm-500"
								>
									{count} {count === 1 ? 'place' : 'places'}
								</span>
								{#if col.visibility === 'link_access'}
									<span
										class="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-warm-100/90 px-2 text-[10px] font-bold leading-none text-warm-500"
									>
										<svg
											class="h-2.5 w-2.5 shrink-0 opacity-90"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
											<circle cx="9" cy="7" r="4" />
											<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
											<path d="M16 3.13a4 4 0 0 1 0 7.75" />
										</svg>
										Shared
									</span>
								{/if}
							</div>
						</div>
					</a>
				</div>

				<!-- Desktop: hover-based delete -->
				<a
					href="/collections/{col.id}"
					class="group hidden h-[120px] w-full shrink-0 flex-col overflow-hidden rounded-xl border border-warm-200/80 bg-white shadow-sm shadow-warm-900/5 transition-all hover:shadow-md hover:shadow-warm-900/10 sm:flex"
				>
					<div class="relative flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
						<div class="flex min-h-0 flex-1 items-center">
							<div class="flex min-w-0 items-center gap-3">
								<div class="flex shrink-0">
									<CollectionAvatar color={col.color} emoji={col.emoji} size="sm" />
								</div>
								<div class="min-h-0 min-w-0 flex-1 overflow-hidden">
									<h3 class="truncate text-base font-extrabold leading-tight text-warm-800">{col.name}</h3>
									{#if col.description}
										<p class="mt-0.5 line-clamp-1 text-[12px] font-medium leading-tight text-warm-500">{col.description}</p>
									{/if}
								</div>
							</div>
						</div>
						<div class="flex min-w-0 shrink-0 items-center justify-between gap-2">
							<div class="flex min-w-0 flex-wrap items-center gap-2">
								<span
									class="inline-flex h-5 w-fit items-center rounded-full bg-warm-100/90 px-2 text-[10px] font-bold leading-none text-warm-500"
								>
									{count} {count === 1 ? 'place' : 'places'}
								</span>
								{#if col.visibility === 'link_access'}
									<span
										class="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-warm-100/90 px-2 text-[10px] font-bold leading-none text-warm-500"
									>
										<svg
											class="h-2.5 w-2.5 shrink-0 opacity-90"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
											<circle cx="9" cy="7" r="4" />
											<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
											<path d="M16 3.13a4 4 0 0 1 0 7.75" />
										</svg>
										Shared
									</span>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if confirmDeleteId === col.id}
									<button
										onclick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(col); confirmDeleteId = null; }}
										class="rounded-md bg-danger-100 px-1.5 py-0.5 text-[10px] font-medium text-danger-700 hover:bg-danger-200"
									>
										Confirm
									</button>
									<button
										onclick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDeleteId = null; }}
										class="text-[10px] text-warm-400"
									>
										Cancel
									</button>
								{:else}
									<button
										onclick={(e) => { e.preventDefault(); e.stopPropagation(); confirmDeleteId = col.id; }}
										class="rounded-md p-1 text-warm-300 opacity-0 transition-all hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100"
										aria-label="Delete collection"
									>
										<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
										</svg>
									</button>
								{/if}
							</div>
						</div>
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
