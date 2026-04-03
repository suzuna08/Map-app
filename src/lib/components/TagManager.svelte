<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';
	import { colorForTag, TAG_PALETTE } from '$lib/tag-colors';
	import { getNextOrderIndex, saveTagOrder, reindexAfterDelete } from '$lib/tag-order';
	import { sortable } from '$lib/actions/sortable';

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
	let colorPickerId = $state<string | null>(null);
	let confirmDeleteId = $state<string | null>(null);
	let newTagName = $state('');
	let newTagColorOverride = $state<string | null>(null);
	let newTagAutoColor = $derived(newTagName.trim() ? colorForTag(toDisplayName(newTagName)) : TAG_PALETTE[0]);
	let newTagColor = $derived(newTagColorOverride ?? newTagAutoColor);
	let saving = $state(false);
	let duplicateWarning = $state('');
	let editInputEl = $state<HTMLInputElement | null>(null);
	let newInputEl = $state<HTMLInputElement | null>(null);

	function normalizeTagName(name: string): string {
		return name.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	function toDisplayName(name: string): string {
		const cleaned = name.trim().replace(/\s+/g, ' ');
		if (cleaned !== cleaned.toLowerCase()) return cleaned;
		return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function startInlineEdit(tag: Tag) {
		editingId = tag.id;
		editName = tag.name;
		colorPickerId = null;
		confirmDeleteId = null;
		duplicateWarning = '';
		requestAnimationFrame(() => {
			editInputEl?.focus();
			editInputEl?.select();
		});
	}

	function cancelInlineEdit() {
		editingId = null;
		editName = '';
		duplicateWarning = '';
	}

	async function saveInlineEdit(tagId: string) {
		const displayName = toDisplayName(editName);
		if (!displayName || saving) return;

		const normalized = normalizeTagName(displayName);
		const conflict = allTags.find((t) => t.id !== tagId && normalizeTagName(t.name) === normalized);
		if (conflict) {
			duplicateWarning = `"${conflict.name}" already exists`;
			return;
		}

		saving = true;
		duplicateWarning = '';
		await supabase.from('tags').update({ name: displayName }).eq('id', tagId);
		saving = false;
		editingId = null;
		onTagsChanged();
	}

	async function changeColor(tagId: string, color: string) {
		await supabase.from('tags').update({ color }).eq('id', tagId);
		colorPickerId = null;
		onTagsChanged();
	}

	async function deleteTag(tagId: string) {
		const ptResult = await supabase.from('place_tags').delete().eq('tag_id', tagId);
		if (ptResult.error) console.error('[TagManager] place_tags delete failed:', ptResult.error);

		const tagResult = await supabase.from('tags').delete().eq('id', tagId);
		if (tagResult.error) console.error('[TagManager] tags delete failed:', tagResult.error);

		await reindexAfterDelete(supabase, userId);
		confirmDeleteId = null;
		onTagsChanged();
	}

	async function createTag() {
		const displayName = toDisplayName(newTagName);
		if (!displayName) return;

		const normalized = normalizeTagName(displayName);
		if (allTags.some((t) => normalizeTagName(t.name) === normalized)) {
			duplicateWarning = `"${allTags.find((t) => normalizeTagName(t.name) === normalized)?.name}" already exists`;
			return;
		}

		duplicateWarning = '';
		const orderIndex = await getNextOrderIndex(supabase, userId);
		const insertData: Record<string, unknown> = { user_id: userId, name: displayName, color: newTagColor, order_index: orderIndex };
		await supabase.from('tags').insert(insertData);
		newTagName = '';
		newTagColorOverride = null;
		onTagsChanged();
	}

	function handleNewKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') createTag();
		else if (e.key === 'Escape') { newTagName = ''; newInputEl?.blur(); }
	}

	function handleEditKeydown(e: KeyboardEvent, tagId: string) {
		if (e.key === 'Enter') saveInlineEdit(tagId);
		else if (e.key === 'Escape') cancelInlineEdit();
	}

	async function handleReorder(orderedIds: string[]) {
		const result = await saveTagOrder(supabase, orderedIds);
		if (!result.ok) {
			console.error('[TagManager] reorder persistence failed');
		}
		onTagsChanged();
	}

	function handleEditBlur(tagId: string) {
		setTimeout(() => {
			if (editingId === tagId) cancelInlineEdit();
		}, 150);
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}
</script>

<div use:portal>
<!-- Backdrop -->
<button
	class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
	onclick={onClose}
	aria-label="Close tag manager"
></button>

<!-- Modal -->
<div class="fixed inset-x-4 top-[10%] z-50 mx-auto max-h-[80dvh] max-w-md overflow-hidden rounded-2xl border border-warm-200 bg-warm-50 shadow-2xl sm:right-auto sm:left-1/2 sm:top-[15%] sm:max-h-[70vh] sm:w-full sm:-translate-x-1/2 lg:left-[calc(16rem+(100vw-16rem)*0.29)]">
	<!-- Header -->
	<div class="flex items-center justify-between px-5 py-4">
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

	<!-- New tag input (top) -->
	<div class="border-b border-warm-200 px-5 pb-3">
		{#if duplicateWarning && !editingId}
			<p class="mb-1.5 text-[11px] font-medium text-amber-600">{duplicateWarning}</p>
		{/if}
		<div class="flex items-center gap-2.5">
			<span
				class="h-3.5 w-3.5 shrink-0 rounded-full transition-colors"
				style="background-color: {newTagName.trim() ? newTagColor : '#d1d5db'}"
			></span>
			<input
				bind:this={newInputEl}
				type="text"
				bind:value={newTagName}
				oninput={() => { newTagColorOverride = null; duplicateWarning = ''; }}
				onkeydown={handleNewKeydown}
				placeholder="New tag..."
				class="flex-1 border-0 bg-transparent py-1 text-base text-warm-700 placeholder-warm-400 focus:outline-none sm:text-sm"
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
		{#if newTagName.trim()}
			<div class="mt-2 flex flex-wrap gap-1.5 pl-6">
				{#each TAG_PALETTE as color}
					<button
						onclick={() => { newTagColorOverride = color; }}
						class="h-5.5 w-5.5 rounded-full transition-transform {newTagColor === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
						style="background-color: {color}"
						aria-label="Select color"
					></button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Tag list -->
	<div
		class="max-h-[50vh] overflow-y-auto px-2 py-1.5 sm:px-3"
		use:sortable={{
			onReorder: handleReorder,
			itemSelector: '[data-tag-id]',
			idAttribute: 'data-tag-id',
			longPressMs: 400,
			disabled: false,
			ignoreDragFrom: 'button, input, [role="button"]'
		}}
	>
		{#if allTags.length === 0}
			<p class="py-8 text-center text-sm text-warm-400">No tags yet</p>
		{/if}

		{#each allTags as tag (tag.id)}
			{#if confirmDeleteId === tag.id}
			<!-- Delete confirmation -->
			<div class="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
				<span class="text-xs text-red-600">Delete "{tag.name}"?</span>
				<div class="flex items-center gap-1">
					<button
						onclick={() => { confirmDeleteId = null; }}
						class="rounded-md px-2 py-0.5 text-[11px] text-warm-500 hover:bg-white"
					>Cancel</button>
					<button
						onclick={() => deleteTag(tag.id)}
						class="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700"
					>Delete</button>
				</div>
			</div>
			{:else}
				<!-- Tag row -->
				<div data-tag-id={tag.id} class="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-warm-100/70">
					<!-- Color dot (clickable) -->
					<button
						onclick={() => { colorPickerId = colorPickerId === tag.id ? null : tag.id; editingId = null; }}
						class="h-3.5 w-3.5 shrink-0 rounded-full transition-transform hover:scale-125"
						style="background-color: {tag.color ?? '#9a8a70'}"
						aria-label="Change color"
					></button>

					<!-- Tag name: inline-editable -->
					{#if editingId === tag.id}
						<input
							bind:this={editInputEl}
							type="text"
							bind:value={editName}
							onkeydown={(e) => handleEditKeydown(e, tag.id)}
							onblur={() => handleEditBlur(tag.id)}
							class="flex-1 rounded-md border border-brand-300 bg-white px-2 py-0.5 text-sm text-warm-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/40"
						/>
					{:else}
						<button
							onclick={() => startInlineEdit(tag)}
							class="flex-1 truncate text-left text-sm text-warm-700 hover:text-warm-900"
						>
							{tag.name}
						</button>
					{/if}

					<!-- Duplicate warning (inline) -->
					{#if duplicateWarning && editingId === tag.id}
						<span class="shrink-0 text-[10px] font-medium text-amber-600">{duplicateWarning}</span>
					{/if}

					<!-- Delete (hover) -->
					<button
						onclick={() => { confirmDeleteId = tag.id; editingId = null; colorPickerId = null; }}
						class="shrink-0 rounded-md p-1 text-warm-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
						aria-label="Delete tag"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6" />
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
					</button>
				</div>

				<!-- Color picker (shown below row when dot is clicked) -->
				{#if colorPickerId === tag.id}
					<div class="mb-1 ml-6 flex flex-wrap gap-1.5 rounded-lg bg-warm-100/60 px-3 py-2">
						{#each TAG_PALETTE as color}
							<button
								onclick={() => changeColor(tag.id, color)}
								class="h-5.5 w-5.5 rounded-full transition-transform {(tag.color ?? '#9a8a70') === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
								style="background-color: {color}"
								aria-label="Select color"
							></button>
						{/each}
					</div>
				{/if}
			{/if}
		{/each}
	</div>
</div>
</div>
