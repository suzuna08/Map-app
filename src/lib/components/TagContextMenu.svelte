<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';
	import { TAG_PALETTE } from '$lib/tag-colors';
	import { reindexAfterDelete } from '$lib/tag-order';

	interface Props {
		tag: Tag;
		x: number;
		y: number;
		supabase: SupabaseClient;
		allTags: Tag[];
		onClose: () => void;
		onTagsChanged: () => void;
	}

	let { tag, x, y, supabase, allTags, onClose, onTagsChanged }: Props = $props();

	let mode = $state<'menu' | 'rename' | 'color' | 'delete'>('menu');
	let renameValue = $state(tag.name);
	let saving = $state(false);
	let warning = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	function normalizeTagName(name: string): string {
		return name.toLowerCase().trim().replace(/\s+/g, ' ');
	}

	function toDisplayName(name: string): string {
		const cleaned = name.trim().replace(/\s+/g, ' ');
		if (cleaned !== cleaned.toLowerCase()) return cleaned;
		return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	let adjustedX = $derived(Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 216));
	let adjustedY = $derived(Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 220));

	$effect(() => {
		if (mode === 'rename') {
			requestAnimationFrame(() => {
				inputEl?.focus();
				inputEl?.select();
			});
		}
	});

	$effect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});

	async function renameTag() {
		const displayName = toDisplayName(renameValue);
		if (!displayName || saving) return;

		const normalized = normalizeTagName(displayName);
		const conflict = allTags.find((t) => t.id !== tag.id && normalizeTagName(t.name) === normalized);
		if (conflict) {
			warning = `"${conflict.name}" already exists`;
			return;
		}

		saving = true;
		await supabase.from('tags').update({ name: displayName }).eq('id', tag.id);
		saving = false;
		onClose();
		onTagsChanged();
	}

	async function changeColor(color: string) {
		await supabase.from('tags').update({ color }).eq('id', tag.id);
		onClose();
		onTagsChanged();
	}

	async function deleteTag() {
		await supabase.from('place_tags').delete().eq('tag_id', tag.id);
		await supabase.from('tags').delete().eq('id', tag.id);
		await reindexAfterDelete(supabase, tag.user_id);
		onClose();
		onTagsChanged();
	}

	function handleRenameKeydown(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter') renameTag();
		else if (e.key === 'Escape') onClose();
	}
</script>

<!-- Backdrop -->
<button
	class="fixed inset-0 z-[60]"
	onclick={onClose}
	oncontextmenu={(e) => { e.preventDefault(); onClose(); }}
	aria-label="Close menu"
></button>

<!-- Menu -->
<div
	class="fixed z-[60] w-52 overflow-hidden rounded-xl border border-warm-200 bg-white shadow-xl"
	style="left: {adjustedX}px; top: {adjustedY}px"
>
	{#if mode === 'menu'}
		<div class="border-b border-warm-100 px-3 py-2">
			<div class="flex items-center gap-2">
				<span class="h-3 w-3 shrink-0 rounded-full" style="background-color: {tag.color ?? '#6b7280'}"></span>
				<span class="truncate text-xs font-bold text-warm-700">{tag.name}</span>
			</div>
		</div>
		<div class="py-1">
			<button
				onclick={() => { mode = 'rename'; }}
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-warm-600 hover:bg-warm-50"
			>
				<svg class="h-3.5 w-3.5 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
				</svg>
				Rename
			</button>
			<button
				onclick={() => { mode = 'color'; }}
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-warm-600 hover:bg-warm-50"
			>
				<svg class="h-3.5 w-3.5 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
				</svg>
				Change color
			</button>
			<div class="mx-2 my-0.5 border-t border-warm-100"></div>
			<button
				onclick={() => { mode = 'delete'; }}
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50"
			>
				<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
				Delete tag
			</button>
		</div>

	{:else if mode === 'rename'}
		<div class="p-3">
			<label class="mb-1.5 block text-[11px] font-bold text-warm-400">Rename tag</label>
			<input
				bind:this={inputEl}
				bind:value={renameValue}
				onkeydown={handleRenameKeydown}
				class="w-full rounded-lg border border-warm-200 bg-warm-50 px-2.5 py-1.5 text-sm text-warm-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
			/>
			{#if warning}
				<p class="mt-1 text-[10px] font-medium text-amber-600">{warning}</p>
			{/if}
			<div class="mt-2.5 flex items-center justify-end gap-1.5">
				<button
					onclick={() => { mode = 'menu'; warning = ''; }}
					class="rounded-md px-2.5 py-1 text-[11px] text-warm-500 hover:bg-warm-100"
				>
					Back
				</button>
				<button
					onclick={renameTag}
					disabled={!renameValue.trim() || saving}
					class="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50"
				>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>

	{:else if mode === 'color'}
		<div class="p-3">
			<label class="mb-2 block text-[11px] font-bold text-warm-400">Choose color</label>
			<div class="flex flex-wrap gap-2">
				{#each TAG_PALETTE as color}
					<button
						onclick={() => changeColor(color)}
						class="h-5.5 w-5.5 rounded-full transition-transform {(tag.color ?? '#6b7280') === color ? 'ring-2 ring-offset-1 ring-warm-400 scale-110' : 'hover:scale-110'}"
						style="background-color: {color}"
						aria-label="Select color"
					></button>
				{/each}
			</div>
		</div>

	{:else if mode === 'delete'}
		<div class="p-3">
			<p class="text-xs leading-relaxed text-warm-600">
				Delete <strong class="text-warm-800">"{tag.name}"</strong> and remove from all places?
			</p>
			<div class="mt-2.5 flex items-center justify-end gap-1.5">
				<button
					onclick={() => { mode = 'menu'; }}
					class="rounded-md px-2.5 py-1 text-[11px] text-warm-500 hover:bg-warm-100"
				>
					Cancel
				</button>
				<button
					onclick={deleteTag}
					class="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700"
				>
					Delete
				</button>
			</div>
		</div>
	{/if}
</div>
