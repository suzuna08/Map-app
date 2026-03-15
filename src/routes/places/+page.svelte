<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Place, Tag } from '$lib/types/database';
	import TagSidebar from '$lib/components/TagSidebar.svelte';
	import PlaceCard from '$lib/components/PlaceCard.svelte';
	import PlaceListItem from '$lib/components/PlaceListItem.svelte';
	import TagManager from '$lib/components/TagManager.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let places = $state<Place[]>([]);
	let allTags = $state<Tag[]>([]);
	let placeTagsMap = $state<Record<string, Tag[]>>({});
	let loading = $state(true);
	let search = $state('');
	let selectedTagMap = $state<Record<string, boolean>>({});
	let selectedSource = $state('all');
	let enriching = $state(false);
	let enrichingId = $state<string | null>(null);
	let enrichResult = $state<{ enriched: number; total: number } | null>(null);
	let sidebarOpen = $state(false);
	let showTagManager = $state(false);
	let viewMode = $state<'grid' | 'list'>('grid');

	$effect(() => {
		if (!session) goto('/login');
	});

	$effect(() => {
		if (session) loadData();
	});

	async function loadData() {
		loading = true;
		const [placesRes, tagsRes, placeTagsRes] = await Promise.all([
			supabase.from('places').select('*').order('created_at', { ascending: false }),
			supabase.from('tags').select('*').order('name'),
			supabase.from('place_tags').select('place_id, tag_id')
		]);
		places = (placesRes.data ?? []) as Place[];
		allTags = (tagsRes.data ?? []) as Tag[];
		buildTagMap((placeTagsRes.data ?? []) as { place_id: string; tag_id: string }[]);
		loading = false;
	}

	function buildTagMap(ptData: { place_id: string; tag_id: string }[]) {
		const map: Record<string, Tag[]> = {};
		for (const pt of ptData) {
			const tag = allTags.find((t) => t.id === pt.tag_id);
			if (tag) {
				if (!map[pt.place_id]) map[pt.place_id] = [];
				map[pt.place_id].push(tag);
			}
		}
		placeTagsMap = map;
	}

	async function refreshTags() {
		const [tagsRes, placeTagsRes] = await Promise.all([
			supabase.from('tags').select('*').order('name'),
			supabase.from('place_tags').select('place_id, tag_id')
		]);
		allTags = (tagsRes.data ?? []) as Tag[];
		buildTagMap((placeTagsRes.data ?? []) as { place_id: string; tag_id: string }[]);
	}

	let categoryTags = $derived(allTags.filter((t) => t.source === 'category'));
	let areaTags = $derived(allTags.filter((t) => t.source === 'area'));
	let userTags = $derived(allTags.filter((t) => t.source === 'user'));
	let selectedTagIds = $derived(Object.keys(selectedTagMap).filter((id) => selectedTagMap[id]));
	let hasActiveFilters = $derived(selectedTagIds.length > 0);

	let sourceLists = $derived([...new Set(places.map((p) => p.source_list).filter((s): s is string => !!s))]);
	let sourceCountMap = $derived(
		sourceLists.reduce<Record<string, number>>((acc, s) => {
			acc[s] = places.filter((p) => p.source_list === s).length;
			return acc;
		}, {})
	);

	let unenrichedCount = $derived(places.filter((p) => !p.enriched_at && p.url).length);

	let filteredPlaces = $derived(
		places.filter((p) => {
			const pTags = placeTagsMap[p.id] ?? [];
			const searchLower = search.toLowerCase();
			const matchesSearch =
				search === '' ||
				p.title.toLowerCase().includes(searchLower) ||
				(p.description ?? '').toLowerCase().includes(searchLower) ||
				(p.address ?? '').toLowerCase().includes(searchLower) ||
				pTags.some((t) => t.name.toLowerCase().includes(searchLower));
			const matchesSource = selectedSource === 'all' || p.source_list === selectedSource;
		const matchesTags =
			!hasActiveFilters || selectedTagIds.every((tagId) => pTags.some((t) => t.id === tagId));
			return matchesSearch && matchesSource && matchesTags;
		})
	);

	function toggleTag(tagId: string) {
		const copy = { ...selectedTagMap };
		if (copy[tagId]) {
			delete copy[tagId];
		} else {
			copy[tagId] = true;
		}
		selectedTagMap = copy;
		sidebarOpen = false;
	}

	async function enrichSingle(placeId: string) {
		enrichingId = placeId;
		try {
			const res = await fetch(`/api/places/${placeId}/enrich`, { method: 'POST' });
			if (res.ok) {
				const { place: enriched } = await res.json();
				places = places.map((p) => (p.id === placeId ? { ...p, ...enriched } : p));
				await refreshTags();
			}
		} finally {
			enrichingId = null;
		}
	}

	async function enrichBatch() {
		enriching = true;
		enrichResult = null;
		try {
			const res = await fetch('/api/places/enrich-all', { method: 'POST' });
			if (res.ok) {
				enrichResult = await res.json();
				await loadData();
			}
		} finally {
			enriching = false;
		}
	}

	async function deletePlace(id: string) {
		await supabase.from('places').delete().eq('id', id);
		places = places.filter((p) => p.id !== id);
	}
</script>

<div class="flex min-h-[calc(100dvh-3.5rem)]">
	<!-- Sidebar -->
	<TagSidebar
		{supabase}
		userId={session?.user?.id ?? ''}
		{allTags}
		{placeTagsMap}
		totalPlaces={places.length}
		{sourceLists}
		{sourceCountMap}
		{selectedTagMap}
		{selectedSource}
		onTagToggle={toggleTag}
		onSourceSelect={(s) => { selectedSource = s; sidebarOpen = false; }}
		onTagsChanged={refreshTags}
		mobileOpen={sidebarOpen}
		onMobileClose={() => { sidebarOpen = false; }}
	/>

	<!-- Main content -->
	<div class="flex-1 lg:ml-64">
		<div class="mx-auto max-w-5xl px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
			<!-- Mobile sidebar toggle + search bar -->
			<div class="mb-5 flex items-center gap-3">
				<button
					onclick={() => { sidebarOpen = true; }}
					class="rounded-lg border border-warm-200 p-2 text-warm-500 lg:hidden"
					aria-label="Open sidebar"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="3" y1="6" x2="21" y2="6" />
						<line x1="3" y1="12" x2="21" y2="12" />
						<line x1="3" y1="18" x2="21" y2="18" />
					</svg>
				</button>
				<div class="relative flex-1">
					<svg
						class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-400"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						bind:value={search}
						placeholder="Search places, tags, addresses..."
						class="w-full rounded-xl border border-warm-200 bg-warm-50 py-2.5 pl-11 pr-4 text-base font-medium shadow-sm transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 sm:text-sm"
					/>
				</div>
			</div>

			<!-- Active filters display -->
			{#if hasActiveFilters || selectedSource !== 'all'}
				<div class="mb-4 flex flex-wrap items-center gap-2">
					<span class="text-xs text-warm-400">Filtered by:</span>
					{#each selectedTagIds as tagId (tagId)}
						{@const tag = allTags.find((t) => t.id === tagId)}
						{#if tag}
							<button
								onclick={() => toggleTag(tagId)}
								class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
								style="background-color: {tag.color ?? '#6b7280'}"
							>
								{tag.name}
								<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						{/if}
					{/each}
					{#if selectedSource !== 'all'}
						<button
							onclick={() => { selectedSource = 'all'; }}
							class="inline-flex items-center gap-1 rounded-full bg-warm-200 px-2.5 py-0.5 text-xs font-medium text-warm-700"
						>
							{selectedSource}
							<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
					<button
						onclick={() => { selectedTagMap = {}; selectedSource = 'all'; }}
						class="text-xs text-warm-400 hover:text-warm-600"
					>
						Clear all
					</button>
				</div>
			{/if}

			<!-- Enrich banner -->
			{#if unenrichedCount > 0}
				<div class="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
					<span class="text-sm text-amber-700">
						{unenrichedCount} places missing details from Google
					</span>
					<button
						onclick={enrichBatch}
						disabled={enriching}
						class="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
					>
						{enriching ? 'Fetching...' : 'Fetch Details'}
					</button>
				</div>
			{/if}

			{#if enrichResult}
				<div class="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
					Fetched details for {enrichResult.enriched} of {enrichResult.total} places.
				</div>
			{/if}

			<!-- Unified smart tag filter row -->
			<div class="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2">
				<!-- All button -->
				<button
					onclick={() => { selectedTagMap = {}; selectedSource = 'all'; }}
					class="text-xs font-extrabold transition-all {!hasActiveFilters && selectedSource === 'all'
					? 'text-warm-800 underline decoration-brand-500 decoration-2 underline-offset-4'
					: 'text-warm-400 hover:text-warm-600'}"
				>
					All
				</button>

			<!-- Category tags: plain text style, minimal -->
			{#if categoryTags.length > 0}
				{#each categoryTags as tag (tag.id)}
					<button
						onclick={() => toggleTag(tag.id)}
					class="text-xs font-bold transition-all {selectedTagMap[tag.id]
						? 'text-warm-800 underline decoration-brand-500 decoration-2 underline-offset-4'
						: 'text-warm-400 hover:text-warm-600'}"
					>
						{tag.name}
					</button>
				{/each}
			{/if}

			<!-- Area tags: subtle blue, geographic feel -->
			{#if areaTags.length > 0}
				{#if categoryTags.length > 0}
					<span class="text-warm-300">·</span>
				{/if}
				{#each areaTags as tag (tag.id)}
					<button
						onclick={() => toggleTag(tag.id)}
					class="text-xs font-bold transition-all {selectedTagMap[tag.id]
						? 'text-sage-700 underline decoration-sage-500 decoration-2 underline-offset-4'
						: 'text-sage-400 hover:text-sage-600'}"
					>
						{tag.name}
					</button>
				{/each}
			{/if}

			<!-- Divider before user tags -->
			{#if categoryTags.length > 0 || areaTags.length > 0}
				<span class="mx-0.5 h-4 w-px bg-warm-300"></span>
			{/if}

			<!-- User tags: solid colored pills - clearly "yours" -->
			{#each userTags as tag (tag.id)}
				<button
					onclick={() => toggleTag(tag.id)}
					class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all {selectedTagMap[tag.id]
						? 'text-white shadow-sm ring-2 ring-offset-1'
						: 'text-white opacity-80 hover:opacity-100'}"
					style="background-color: {tag.color ?? '#6b7280'}; {selectedTagMap[tag.id] ? `ring-color: ${tag.color ?? '#6b7280'}` : ''}"
				>
					{tag.name}
					{#if selectedTagMap[tag.id]}
						<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					{/if}
				</button>
			{/each}

				<!-- Add / Edit tags -->
				<button
					onclick={() => { showTagManager = true; }}
					class="inline-flex items-center gap-1 rounded-full border border-dashed border-warm-300 px-2.5 py-1 text-xs text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600"
					aria-label="Manage tags"
				>
					<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
			</div>

			<!-- Tag manager modal -->
			{#if showTagManager}
				<TagManager
					{supabase}
					userId={session?.user?.id ?? ''}
					allTags={userTags}
					onClose={() => { showTagManager = false; }}
					onTagsChanged={refreshTags}
				/>
			{/if}

			<!-- Results count + view toggle -->
			<div class="mb-4 flex items-center justify-between">
				<p class="text-sm font-semibold text-warm-500">{filteredPlaces.length} places</p>
				<div class="flex items-center gap-1 rounded-lg border border-warm-200 bg-white p-0.5">
					<button
						onclick={() => { viewMode = 'grid'; }}
						class="rounded-md p-2 transition-colors {viewMode === 'grid' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
						aria-label="Grid view"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7" />
							<rect x="14" y="3" width="7" height="7" />
							<rect x="3" y="14" width="7" height="7" />
							<rect x="14" y="14" width="7" height="7" />
						</svg>
					</button>
					<button
						onclick={() => { viewMode = 'list'; }}
						class="rounded-md p-2 transition-colors {viewMode === 'list' ? 'bg-warm-200 text-warm-700' : 'text-warm-400 hover:text-warm-600'}"
						aria-label="List view"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="8" y1="6" x2="21" y2="6" />
							<line x1="8" y1="12" x2="21" y2="12" />
							<line x1="8" y1="18" x2="21" y2="18" />
							<line x1="3" y1="6" x2="3.01" y2="6" />
							<line x1="3" y1="12" x2="3.01" y2="12" />
							<line x1="3" y1="18" x2="3.01" y2="18" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Places -->
			{#if loading}
				<div class="flex items-center justify-center py-20">
					<svg class="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
					</svg>
				</div>
			{:else if filteredPlaces.length === 0}
				<div class="py-20 text-center">
					<svg class="mx-auto h-12 w-12 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
					<p class="mt-3 text-sm text-warm-500">
						{places.length === 0 ? 'No places yet' : 'No places match your filters'}
					</p>
					{#if places.length === 0}
						<a href="/upload" class="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700">
							Upload some CSV files to get started
						</a>
					{/if}
				</div>
			{:else if viewMode === 'grid'}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each filteredPlaces as place (place.id)}
						<PlaceCard
							{place}
							placeTags={placeTagsMap[place.id] ?? []}
							{allTags}
							{supabase}
							userId={session?.user?.id ?? ''}
							{enrichingId}
							onEnrich={enrichSingle}
							onDelete={deletePlace}
							onTagClick={toggleTag}
							onTagsChanged={refreshTags}
						/>
					{/each}
				</div>
			{:else}
				<div class="space-y-2">
					{#each filteredPlaces as place (place.id)}
						<PlaceListItem
							{place}
							placeTags={placeTagsMap[place.id] ?? []}
							onTagClick={toggleTag}
						/>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
