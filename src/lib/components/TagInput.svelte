<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { Tag } from '$lib/types/database';

	interface Props {
		supabase: SupabaseClient;
		placeId: string;
		userId: string;
		allTags: Tag[];
		placeTags: Tag[];
		onUpdate: () => void;
		onTagClick?: (tagId: string) => void;
	}

	let { supabase, placeId, userId, allTags, placeTags, onUpdate, onTagClick }: Props = $props();

	let inputValue = $state('');
	let showSuggestions = $state(false);
	let showInput = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	let userTags = $derived(allTags.filter((t) => t.source === 'user'));

	let suggestions = $derived(
		inputValue.trim().length > 0
			? userTags.filter(
					(t) =>
						t.name.toLowerCase().includes(inputValue.toLowerCase()) &&
						!placeTags.some((pt) => pt.id === t.id)
				)
			: userTags.filter((t) => !placeTags.some((pt) => pt.id === t.id))
	);

	let showCreateOption = $derived(
		inputValue.trim().length > 0 &&
			!allTags.some((t) => t.name.toLowerCase() === inputValue.trim().toLowerCase())
	);

	const TAG_COLORS = [
		'#c4898a', '#7b8fa8', '#b07c6a', '#9a7f9e', '#6a9b96',
		'#b89760', '#7882a0', '#c08878', '#8a9462', '#a88290'
	];

	function randomColor(): string {
		return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
	}

	async function createAndAddTag(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;

		let tag = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());

		if (!tag) {
			const { data } = await supabase
				.from('tags')
				.insert({ user_id: userId, name: trimmed, color: randomColor() })
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

	function openInput() {
		showInput = true;
		requestAnimationFrame(() => inputEl?.focus());
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each placeTags.filter((t) => t.source === 'user') as tag (tag.id)}
		<span
			class="inline-flex items-center gap-0.5 rounded-full text-[11px] font-bold text-white"
			style="background-color: {tag.color ?? '#6b7280'}"
		>
			<button
				onclick={() => onTagClick?.(tag.id)}
				class="py-0.5 pl-2.5 transition-opacity hover:opacity-80"
			>
				{tag.name}
			</button>
		<button
			onclick={() => removeTag(tag.id)}
			class="rounded-full p-1 pr-2 opacity-60 transition-opacity hover:opacity-100"
			aria-label="Remove tag {tag.name}"
		>
				<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</span>
	{/each}

	{#if showInput}
		<div class="relative">
			<input
				bind:this={inputEl}
				bind:value={inputValue}
				onfocus={() => { showSuggestions = true; }}
				onblur={() => { setTimeout(() => { showSuggestions = false; showInput = false; inputValue = ''; }, 150); }}
				onkeydown={handleKeydown}
				placeholder="tag name..."
				class="w-28 rounded-full border border-warm-200 bg-warm-50 px-2.5 py-1 text-base text-warm-700 placeholder-warm-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 sm:text-xs"
			/>

			{#if showSuggestions && (suggestions.length > 0 || showCreateOption)}
				<div class="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-warm-200 bg-white py-1 shadow-lg">
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
							<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							Create "{inputValue.trim()}"
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
	<button
		onclick={openInput}
		class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-warm-300 text-warm-400 transition-colors hover:border-warm-400 hover:bg-warm-100 hover:text-warm-500"
		aria-label="Add tag"
	>
		<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<line x1="12" y1="5" x2="12" y2="19" />
			<line x1="5" y1="12" x2="19" y2="12" />
		</svg>
	</button>
	{/if}
</div>
