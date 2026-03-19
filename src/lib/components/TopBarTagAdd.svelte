<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';
	import { colorForTag } from '$lib/tag-colors';
	import { getNextOrderIndex } from '$lib/tag-order';

	interface Props {
		supabase: SupabaseClient;
		userId: string;
		allTags: Tag[];
		onTagsChanged: () => void;
		compact?: boolean;
	}

	let { supabase, userId, allTags, onTagsChanged, compact = false }: Props = $props();

	let inputValue = $state('');
	let open = $state(false);
	let showSuggestions = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let anchorEl = $state<HTMLElement | null>(null);
	let dropdownPos = $state<{ top: number; left: number; maxWidth: number } | null>(null);
	let rafId = 0;

	function normalizeTagName(name: string): string {
		return name.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	function toDisplayName(name: string): string {
		const cleaned = name.trim().replace(/\s+/g, ' ');
		if (cleaned !== cleaned.toLowerCase()) return cleaned;
		return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	let userTags = $derived(allTags.filter((t) => t.source === 'user'));

	let suggestions = $derived(
		inputValue.trim().length > 0
			? userTags.filter((t) =>
					normalizeTagName(t.name).includes(normalizeTagName(inputValue))
				)
			: []
	);

	let exactMatch = $derived(
		inputValue.trim().length > 0 &&
			allTags.some((t) => normalizeTagName(t.name) === normalizeTagName(inputValue))
	);

	let showCreateOption = $derived(inputValue.trim().length > 0 && !exactMatch);

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy() { node.remove(); } };
	}

	function updatePos() {
		const el = anchorEl ?? inputEl;
		if (!el) { dropdownPos = null; return; }
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const left = Math.max(8, Math.min(rect.left, vw - 208));
		dropdownPos = {
			top: rect.bottom + 4,
			left,
			maxWidth: Math.min(200, vw - left - 8)
		};
	}

	function startPositionTracking() {
		function tick() {
			if (open) {
				updatePos();
				rafId = requestAnimationFrame(tick);
			}
		}
		rafId = requestAnimationFrame(tick);
	}

	function stopPositionTracking() {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function openInput() {
		open = true;
		requestAnimationFrame(() => {
			inputEl?.focus();
			updatePos();
			startPositionTracking();
		});
	}

	function closeInput() {
		open = false;
		showSuggestions = false;
		inputValue = '';
		dropdownPos = null;
		stopPositionTracking();
	}

	let creating = $state(false);

	async function createTag(name: string) {
		if (creating) return;
		const displayName = toDisplayName(name);
		if (!displayName) return;

		const normalized = normalizeTagName(displayName);
		if (allTags.some((t) => normalizeTagName(t.name) === normalized)) return;

		creating = true;
		const orderIndex = await getNextOrderIndex(supabase, userId);
		await supabase.from('tags').insert({
			user_id: userId,
			name: displayName,
			color: colorForTag(displayName),
			source: 'user',
			order_index: orderIndex
		});

		creating = false;
		closeInput();
		onTagsChanged();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (inputValue.trim()) createTag(inputValue);
		} else if (e.key === 'Escape') {
			closeInput();
			e.stopPropagation();
		}
	}

	function handleBlur() {
		setTimeout(() => {
			if (open) closeInput();
		}, 180);
	}
</script>

{#if open}
	<div bind:this={anchorEl} class="inline-flex items-center">
		<input
			bind:this={inputEl}
			bind:value={inputValue}
			onfocus={() => { showSuggestions = true; }}
			onblur={handleBlur}
			oninput={() => { showSuggestions = true; }}
			onkeydown={handleKeydown}
			placeholder="Tag name..."
			class="w-24 rounded-full border border-brand-300 bg-white px-2.5 py-0.5 text-xs font-medium text-warm-700 placeholder-warm-400 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30 sm:w-28 {compact ? 'py-0.5 text-[11px]' : 'py-1 text-xs'}"
		/>
	</div>
{:else}
	<button
		onclick={openInput}
		class="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-warm-300 text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-600 {compact ? 'px-2 py-0.5 text-[11px]' : 'px-2 py-1 text-[10px]'}"
		aria-label="Add tag"
	>
		<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
		Add
	</button>
{/if}

{#if open && showSuggestions && dropdownPos && (suggestions.length > 0 || showCreateOption)}
	<div
		use:portal
		class="fixed z-[9999] w-48 overflow-hidden rounded-lg border border-warm-200 bg-white shadow-xl"
		style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; max-width: {dropdownPos.maxWidth}px; pointer-events: auto;"
	>
		{#each suggestions.slice(0, 5) as tag (tag.id)}
			<button
				onmousedown={(e) => { e.preventDefault(); createTag(tag.name); }}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-warm-50 active:bg-warm-100"
			>
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-full"
					style="background-color: {tag.color ?? '#6b7280'}"
				></span>
				<span class="truncate">{tag.name}</span>
			</button>
		{/each}
		{#if showCreateOption}
			<button
				onmousedown={(e) => { e.preventDefault(); createTag(inputValue); }}
				class="flex w-full items-center gap-2 border-t border-warm-100 px-3 py-2 text-left text-xs text-brand-600 transition-colors hover:bg-brand-50 active:bg-brand-100"
			>
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-full"
					style="background-color: {colorForTag(toDisplayName(inputValue))}"
				></span>
				<span class="truncate">Create "{toDisplayName(inputValue)}"</span>
			</button>
		{/if}
	</div>
{/if}
