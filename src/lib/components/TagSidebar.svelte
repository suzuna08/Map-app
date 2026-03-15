<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';

	interface Props {
		supabase: SupabaseClient;
		userId: string;
		allTags: Tag[];
		placeTagsMap: Record<string, Tag[]>;
		totalPlaces: number;
		sourceLists: string[];
		sourceCountMap: Record<string, number>;
		selectedTagMap: Record<string, boolean>;
		selectedSource: string;
		onTagToggle: (tagId: string) => void;
		onSourceSelect: (source: string) => void;
		onTagsChanged: () => void;
		mobileOpen: boolean;
		onMobileClose: () => void;
	}

	let {
		supabase,
		userId,
		allTags,
		placeTagsMap,
		totalPlaces,
		sourceLists,
		sourceCountMap,
		selectedTagMap,
		selectedSource,
		onTagToggle,
		onSourceSelect,
		onTagsChanged,
		mobileOpen,
		onMobileClose
	}: Props = $props();

	let newTagName = $state('');
	let showNewTag = $state(false);
	let creating = $state(false);

	const TAG_COLORS = [
		'#c4898a', '#7b8fa8', '#b07c6a', '#9a7f9e', '#6a9b96',
		'#b89760', '#7882a0', '#c08878', '#8a9462', '#a88290'
	];

	let categoryTags = $derived(allTags.filter((t) => t.source === 'category'));
	let areaTags = $derived(allTags.filter((t) => t.source === 'area'));
	let userTags = $derived(allTags.filter((t) => t.source === 'user'));
	let selectedTagIds = $derived(Object.keys(selectedTagMap).filter((id) => selectedTagMap[id]));
	let hasActiveFilters = $derived(selectedTagIds.length > 0);

	function tagCount(tagId: string): number {
		return Object.values(placeTagsMap).filter((tags) => tags.some((t) => t.id === tagId)).length;
	}

	async function createTag() {
		const trimmed = newTagName.trim();
		if (!trimmed || creating) return;
		creating = true;

		const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
		await supabase.from('tags').insert({ user_id: userId, name: trimmed, color, source: 'user' });

		newTagName = '';
		showNewTag = false;
		creating = false;
		onTagsChanged();
	}

	async function deleteTag(tagId: string, e: Event) {
		e.stopPropagation();
		await supabase.from('place_tags').delete().eq('tag_id', tagId);
		await supabase.from('tags').delete().eq('id', tagId);
		onTagsChanged();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') createTag();
		else if (e.key === 'Escape') {
			showNewTag = false;
			newTagName = '';
		}
	}
</script>

<!-- Mobile overlay -->
{#if mobileOpen}
	<button
		class="fixed inset-0 z-40 bg-warm-900/30 backdrop-blur-sm lg:hidden"
		onclick={onMobileClose}
		aria-label="Close sidebar"
	></button>
{/if}

<aside
	class="fixed top-14 bottom-0 left-0 z-40 flex w-64 flex-col border-r border-warm-200 bg-warm-50 transition-transform duration-200 lg:translate-x-0 {mobileOpen ? 'translate-x-0' : '-translate-x-full'}"
>
	<div class="flex-1 overflow-y-auto px-3 py-4">
		<!-- All Places -->
		<button
			onclick={() => {
				onSourceSelect('all');
				if (hasActiveFilters) {
					for (const id of selectedTagIds) onTagToggle(id);
				}
			}}
			class="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold transition-colors {!hasActiveFilters && selectedSource === 'all'
				? 'bg-warm-200 text-warm-800'
				: 'text-warm-600 hover:bg-warm-100'}"
		>
			<div class="flex items-center gap-2">
				<svg class="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				All Places
			</div>
			<span class="text-xs text-warm-400">{totalPlaces}</span>
		</button>

		<!-- Category tags -->
		{#if categoryTags.length > 0}
			<div class="mt-5">
				<div class="mb-2 px-3">
					<span class="text-xs font-bold uppercase tracking-wider text-warm-400">Category</span>
				</div>
				<div class="space-y-0.5">
				{#each categoryTags as tag (tag.id)}
					{@const count = tagCount(tag.id)}
					<button
						onclick={() => onTagToggle(tag.id)}
						class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors {selectedTagMap[tag.id]
							? 'bg-warm-200 text-warm-800'
							: 'text-warm-600 hover:bg-warm-100'}"
					>
						<div class="flex items-center gap-2.5 overflow-hidden">
							<span class="h-2 w-2 shrink-0 rounded-sm bg-warm-400"></span>
							<span class="truncate">{tag.name}</span>
						</div>
						<span class="text-xs text-warm-400">{count}</span>
					</button>
				{/each}
				</div>
			</div>
		{/if}

		<!-- Area tags -->
		{#if areaTags.length > 0}
			<div class="mt-5">
				<div class="mb-2 px-3">
					<span class="text-xs font-bold uppercase tracking-wider text-warm-400">Area</span>
				</div>
				<div class="space-y-0.5">
				{#each areaTags as tag (tag.id)}
					{@const count = tagCount(tag.id)}
					<button
						onclick={() => onTagToggle(tag.id)}
						class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors {selectedTagMap[tag.id]
							? 'bg-sage-200 text-sage-800'
							: 'text-warm-600 hover:bg-warm-100'}"
					>
						<div class="flex items-center gap-2.5 overflow-hidden">
							<span class="h-2 w-2 shrink-0 rounded-sm bg-sage-400"></span>
							<span class="truncate">{tag.name}</span>
						</div>
						<span class="text-xs text-warm-400">{count}</span>
					</button>
				{/each}
				</div>
			</div>
		{/if}

		<!-- User tags -->
		<div class="mt-5">
			<div class="mb-2 flex items-center justify-between px-3">
				<span class="text-xs font-bold uppercase tracking-wider text-warm-400">My Tags</span>
				<button
					onclick={() => { showNewTag = !showNewTag; }}
					class="rounded p-0.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600"
					aria-label="Add new tag"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
			</div>

			{#if showNewTag}
				<div class="mb-2 px-3">
					<input
						type="text"
						bind:value={newTagName}
						onkeydown={handleKeydown}
						placeholder="Tag name..."
						class="w-full rounded-md border border-warm-200 bg-white px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
						autofocus
					/>
				</div>
			{/if}

			<div class="space-y-0.5">
			{#each userTags as tag (tag.id)}
				{@const count = tagCount(tag.id)}
				<div
					role="button"
					tabindex="0"
					onclick={() => onTagToggle(tag.id)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTagToggle(tag.id); }}
					class="group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors {selectedTagMap[tag.id]
						? 'bg-warm-200 text-warm-800'
						: 'text-warm-600 hover:bg-warm-100'}"
				>
					<div class="flex items-center gap-2.5 overflow-hidden">
						<span
							class="h-2.5 w-2.5 shrink-0 rounded-full"
							style="background-color: {tag.color ?? '#9a8a70'}"
						></span>
						<span class="truncate">{tag.name}</span>
					</div>
					<div class="flex items-center gap-1">
						<span class="text-xs text-warm-400">{count}</span>
						<button
							onclick={(e) => deleteTag(tag.id, e)}
							class="rounded p-0.5 text-warm-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
							aria-label="Delete tag {tag.name}"
						>
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
				</div>
			{/each}

				{#if userTags.length === 0 && !showNewTag}
					<p class="px-3 py-2 text-xs text-warm-400">No tags yet. Create one to organize your places.</p>
				{/if}
			</div>
		</div>

		<!-- Sources section -->
		{#if sourceLists.length > 0}
			<div class="mt-6">
				<div class="mb-2 px-3">
					<span class="text-xs font-bold uppercase tracking-wider text-warm-400">Sources</span>
				</div>
				<div class="space-y-0.5">
					{#each sourceLists as source}
						<button
							onclick={() => onSourceSelect(selectedSource === source ? 'all' : source)}
							class="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors {selectedSource === source
								? 'bg-warm-200 text-warm-800'
								: 'text-warm-600 hover:bg-warm-100'}"
						>
							<div class="flex items-center gap-2.5">
								<svg class="h-3.5 w-3.5 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<polyline points="14 2 14 8 20 8" />
								</svg>
								<span class="truncate">{source}</span>
							</div>
							<span class="text-xs text-warm-400">{sourceCountMap[source] ?? 0}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</aside>
