<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';

	interface Props {
		supabase: SupabaseClient;
		userId: string;
		allTags: Tag[];
		onClose: () => void;
		onTagsChanged: () => void;
	}

	let { supabase, userId, allTags, onClose, onTagsChanged }: Props = $props();

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let newTagName = $state('');
	let confirmDeleteId = $state<string | null>(null);
	let saving = $state(false);

	const TAG_COLORS = [
		'#c4898a', '#7b8fa8', '#b07c6a', '#9a7f9e', '#6a9b96',
		'#b89760', '#7882a0', '#c08878', '#8a9462', '#a88290'
	];

	function startEdit(tag: Tag) {
		editingId = tag.id;
		editName = tag.name;
		editColor = tag.color ?? '#6b7280';
		confirmDeleteId = null;
	}

	function cancelEdit() {
		editingId = null;
		editName = '';
		editColor = '';
	}

	async function saveEdit(tagId: string) {
		const trimmed = editName.trim();
		if (!trimmed || saving) return;
		saving = true;

		await supabase
			.from('tags')
			.update({ name: trimmed, color: editColor })
			.eq('id', tagId);

		saving = false;
		editingId = null;
		onTagsChanged();
	}

	async function deleteTag(tagId: string) {
		await supabase.from('place_tags').delete().eq('tag_id', tagId);
		await supabase.from('tags').delete().eq('id', tagId);
		confirmDeleteId = null;
		onTagsChanged();
	}

	async function createTag() {
		const trimmed = newTagName.trim();
		if (!trimmed) return;
		if (allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;

		const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
		await supabase.from('tags').insert({ user_id: userId, name: trimmed, color });
		newTagName = '';
		onTagsChanged();
	}

	function handleNewKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') createTag();
		else if (e.key === 'Escape') { newTagName = ''; }
	}

	function handleEditKeydown(e: KeyboardEvent, tagId: string) {
		if (e.key === 'Enter') saveEdit(tagId);
		else if (e.key === 'Escape') cancelEdit();
	}
</script>

<!-- Backdrop -->
<button
	class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
	onclick={onClose}
	aria-label="Close tag manager"
></button>

<!-- Modal -->
<div class="fixed inset-x-4 top-[15%] z-50 mx-auto max-w-md rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl sm:inset-x-auto sm:w-full">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-warm-200 px-5 py-4">
		<h2 class="text-base font-bold text-warm-800">Manage Tags</h2>
		<button
			onclick={onClose}
			class="rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-200 hover:text-warm-600"
			aria-label="Close"
		>
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>

	<!-- Tag list -->
	<div class="max-h-[50vh] overflow-y-auto px-5 py-3">
		{#if allTags.length === 0}
			<p class="py-6 text-center text-sm text-warm-400">No tags yet. Create one below.</p>
		{/if}

		<div class="space-y-1">
			{#each allTags as tag (tag.id)}
				{#if editingId === tag.id}
					<!-- Edit mode -->
					<div class="rounded-xl bg-warm-100 p-3">
						<div class="mb-2.5 flex items-center gap-2">
							<input
								type="text"
								bind:value={editName}
								onkeydown={(e) => handleEditKeydown(e, tag.id)}
								class="flex-1 rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
								autofocus
							/>
						</div>
						<div class="mb-3 flex flex-wrap gap-1.5">
							{#each TAG_COLORS as color}
								<button
									onclick={() => { editColor = color; }}
									class="h-6 w-6 rounded-full transition-transform {editColor === color ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'}"
									style="background-color: {color}"
									aria-label="Select color {color}"
								></button>
							{/each}
						</div>
						<div class="flex items-center justify-end gap-2">
							<button onclick={cancelEdit} class="rounded-lg px-3 py-1 text-xs text-warm-500 hover:bg-warm-200">
								Cancel
							</button>
							<button
								onclick={() => saveEdit(tag.id)}
								disabled={!editName.trim() || saving}
								class="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
							>
								Save
							</button>
						</div>
					</div>
				{:else if confirmDeleteId === tag.id}
					<!-- Delete confirmation -->
					<div class="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2.5">
						<span class="text-xs text-red-600">Delete "{tag.name}" and remove from all places?</span>
						<div class="flex items-center gap-1.5">
							<button
								onclick={() => { confirmDeleteId = null; }}
								class="rounded-lg px-2.5 py-1 text-xs text-gray-500 hover:bg-white"
							>
								Cancel
							</button>
							<button
								onclick={() => deleteTag(tag.id)}
								class="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
							>
								Delete
							</button>
						</div>
					</div>
				{:else}
					<!-- Normal display -->
					<div class="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-warm-100">
						<span class="h-3 w-3 shrink-0 rounded-full" style="background-color: {tag.color ?? '#9a8a70'}"></span>
						<span class="flex-1 text-sm text-warm-700">{tag.name}</span>
						<div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
							<button
								onclick={() => startEdit(tag)}
								class="rounded-md p-1.5 text-warm-400 hover:bg-warm-200 hover:text-warm-600"
								aria-label="Edit tag {tag.name}"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
							<button
								onclick={() => { confirmDeleteId = tag.id; editingId = null; }}
								class="rounded-md p-1.5 text-warm-400 hover:bg-red-50 hover:text-red-500"
								aria-label="Delete tag {tag.name}"
							>
								<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Create new tag -->
	<div class="border-t border-warm-200 px-5 py-3">
		<div class="flex items-center gap-2">
			<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="12" y1="5" x2="12" y2="19" />
				<line x1="5" y1="12" x2="19" y2="12" />
			</svg>
			<input
				type="text"
				bind:value={newTagName}
				onkeydown={handleNewKeydown}
				placeholder="New tag name..."
				class="flex-1 border-0 bg-transparent py-1 text-sm text-warm-700 placeholder-warm-400 focus:outline-none"
			/>
			{#if newTagName.trim()}
				<button
					onclick={createTag}
					class="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
				>
					Add
				</button>
			{/if}
		</div>
	</div>
</div>
