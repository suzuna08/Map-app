<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';
	import { colorForTag } from '$lib/tag-colors';
	import { getNextOrderIndex, saveTagOrder } from '$lib/tag-order';
	import { sortable } from '$lib/actions/sortable';

	interface Props {
		supabase: SupabaseClient;
		placeId: string;
		userId: string;
		allTags: Tag[];
		placeTags: Tag[];
		onUpdate: () => void;
		onTagClick?: (tagId: string) => void;
		onTagContextMenu?: (tag: Tag, x: number, y: number) => void;
		maxVisible?: number;
	}

	let { supabase, placeId, userId, allTags, placeTags, onUpdate, onTagClick, onTagContextMenu, maxVisible = 6 }: Props = $props();

	let inputValue = $state('');
	let showSuggestions = $state(false);
	let showInput = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let dropdownPos = $state<{ top: number; left: number } | null>(null);

	function updateDropdownPos() {
		if (!inputEl) { dropdownPos = null; return; }
		const rect = inputEl.getBoundingClientRect();
		dropdownPos = { top: rect.bottom + 4, left: rect.left };
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	let expanded = $state(false);

	let userTags = $derived(allTags.filter((t) => t.source === 'user'));
	let displayUserTags = $derived(placeTags.filter((t) => t.source === 'user'));
	let visibleTags = $derived(expanded ? displayUserTags : displayUserTags.slice(0, maxVisible));
	let overflowCount = $derived(Math.max(0, displayUserTags.length - maxVisible));

	function handleTagContextMenu(e: MouseEvent, tag: Tag) {
		e.preventDefault();
		e.stopPropagation();
		onTagContextMenu?.(tag, e.clientX, e.clientY);
	}

	function normalizeTagName(name: string): string {
		return name.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	function toDisplayName(name: string): string {
		const cleaned = name.trim().replace(/\s+/g, ' ');
		const isAllLowercase = cleaned === cleaned.toLowerCase();
		if (!isAllLowercase) return cleaned;
		return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	let suggestions = $derived(
		inputValue.trim().length > 0
			? userTags.filter(
					(t) =>
						normalizeTagName(t.name).includes(normalizeTagName(inputValue)) &&
						!placeTags.some((pt) => pt.id === t.id)
				)
			: userTags.filter((t) => !placeTags.some((pt) => pt.id === t.id))
	);

	let exactMatch = $derived(
		inputValue.trim().length > 0 &&
			allTags.some((t) => normalizeTagName(t.name) === normalizeTagName(inputValue))
	);

	let showCreateOption = $derived(
		inputValue.trim().length > 0 && !exactMatch
	);

	async function createAndAddTag(name: string) {
		const displayName = toDisplayName(name);
		if (!displayName) return;

		const normalized = normalizeTagName(displayName);
		let tag = allTags.find((t) => normalizeTagName(t.name) === normalized);

		if (!tag) {
			const orderIndex = await getNextOrderIndex(supabase, userId);
			const insertData: Record<string, unknown> = { user_id: userId, name: displayName, color: colorForTag(displayName) };
			if (orderIndex !== null) insertData.order_index = orderIndex;
			const { data } = await supabase
				.from('tags')
				.insert(insertData)
				.select()
				.single();
			if (!data) return;
			tag = data as Tag;
		}

		await supabase.from('place_tags').insert({ place_id: placeId, tag_id: tag.id });

		inputValue = '';
		showSuggestions = false;
		showInput = false;
		onUpdate();
	}

	async function removeTag(tagId: string) {
		await supabase
			.from('place_tags')
			.delete()
			.eq('place_id', placeId)
			.eq('tag_id', tagId);
		onUpdate();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (exactMatch) {
				const match = allTags.find((t) => normalizeTagName(t.name) === normalizeTagName(inputValue));
				if (match) { addExistingTag(match); return; }
			}
			if (suggestions.length > 0 && inputValue.trim()) {
				addExistingTag(suggestions[0]);
			} else if (inputValue.trim()) {
				createAndAddTag(inputValue);
			}
		} else if (e.key === 'Escape') {
			showSuggestions = false;
			showInput = false;
			inputValue = '';
			inputEl?.blur();
		}
	}

	async function addExistingTag(tag: Tag) {
		if (placeTags.some((pt) => pt.id === tag.id)) return;

		await supabase.from('place_tags').insert({ place_id: placeId, tag_id: tag.id });

		inputValue = '';
		showSuggestions = false;
		showInput = false;
		onUpdate();
	}

	async function handleReorder(orderedIds: string[]) {
		await saveTagOrder(supabase, orderedIds);
		onUpdate();
	}

	function openInput() {
		showInput = true;
		requestAnimationFrame(() => inputEl?.focus());
	}
</script>

<div
	class="flex flex-wrap items-center gap-1"
	use:sortable={{
		onReorder: handleReorder,
		itemSelector: '[data-tag-id]',
		idAttribute: 'data-tag-id',
		longPressMs: 400,
		disabled: false,
		ignoreDragFrom: 'button, input'
	}}
>
	{#each visibleTags as tag (tag.id)}
		<span
			data-tag-id={tag.id}
			class="inline-flex items-center gap-0.5 rounded-full text-[10px] font-bold text-white sm:text-[11px]"
			style="background-color: {tag.color ?? '#6b7280'}"
		>
			<button
				onclick={() => onTagClick?.(tag.id)}
				oncontextmenu={(e) => handleTagContextMenu(e, tag)}
				class="py-0.5 pl-2 transition-opacity hover:opacity-80 sm:pl-2.5"
			>
				{tag.name}
			</button>
		<button
			onclick={() => removeTag(tag.id)}
			class="rounded-full p-0.5 pr-1.5 opacity-60 transition-opacity hover:opacity-100 sm:p-1 sm:pr-2"
			aria-label="Remove tag {tag.name}"
		>
				<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</span>
	{/each}

	{#if !expanded && overflowCount > 0}
		<button
			onclick={(e) => { e.stopPropagation(); expanded = true; }}
			class="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-bold text-warm-500 transition-colors hover:bg-warm-200 hover:text-warm-700 sm:text-[11px]"
		>
			+{overflowCount} more
		</button>
	{:else if expanded && displayUserTags.length > maxVisible}
		<button
			onclick={(e) => { e.stopPropagation(); expanded = false; }}
			class="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-bold text-warm-500 transition-colors hover:bg-warm-200 hover:text-warm-700 sm:text-[11px]"
		>
			less
		</button>
	{/if}

	{#if showInput}
		<div class="relative">
			<input
				bind:this={inputEl}
				bind:value={inputValue}
				onfocus={() => { showSuggestions = true; updateDropdownPos(); }}
				onblur={() => { setTimeout(() => { showSuggestions = false; showInput = false; inputValue = ''; dropdownPos = null; }, 150); }}
				oninput={() => updateDropdownPos()}
				onkeydown={handleKeydown}
				placeholder="tag name..."
				class="w-24 rounded-full border border-warm-200 bg-warm-50 px-2 py-0.5 text-xs text-warm-700 placeholder-warm-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 sm:w-28 sm:px-2.5 sm:py-1"
			/>
		</div>
	{:else}
	<button
		onclick={openInput}
		class="inline-flex items-center justify-center rounded-full border border-dashed border-warm-300 px-2 py-0.5 text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-500 sm:px-2.5 sm:py-1"
		aria-label="Add tag"
	>
		<svg class="h-2 w-2 sm:h-2.5 sm:w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
	{/if}
</div>

{#if showSuggestions && dropdownPos && (suggestions.length > 0 || showCreateOption)}
	<div
		use:portal
		class="fixed z-[100] w-48 rounded-lg border border-warm-200 bg-white py-1 shadow-lg"
		style="top: {dropdownPos.top}px; left: {dropdownPos.left}px"
	>
		{#each suggestions.slice(0, 5) as tag (tag.id)}
			<button
				onmousedown={(e) => { e.preventDefault(); addExistingTag(tag); }}
				class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-warm-50"
			>
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-full"
					style="background-color: {tag.color ?? '#6b7280'}"
				></span>
				{tag.name}
			</button>
		{/each}
		{#if showCreateOption}
			<button
				onmousedown={(e) => { e.preventDefault(); createAndAddTag(inputValue); }}
				class="flex w-full items-center gap-2 border-t border-warm-100 px-3 py-1.5 text-left text-xs text-brand-600 hover:bg-brand-50"
			>
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-full"
					style="background-color: {colorForTag(toDisplayName(inputValue))}"
				></span>
				Create "{toDisplayName(inputValue)}"
			</button>
		{/if}
	</div>
{/if}
