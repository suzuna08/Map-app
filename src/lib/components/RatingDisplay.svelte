<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import RatingEditor from './RatingEditor.svelte';

	interface Props {
		placeId: string;
		userRating: number | null;
		supabase: SupabaseClient;
		onRatingChanged: (placeId: string, rating: number | null) => void;
		compact?: boolean;
	}

	let { placeId, userRating, supabase, onRatingChanged, compact = false }: Props = $props();

	let editorOpen = $state(false);
	let anchorRect = $state({ top: 0, left: 0, width: 0, height: 0, bottom: 0 });
	let triggerEl = $state<HTMLButtonElement | null>(null);

	function openEditor(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		anchorRect = { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
		editorOpen = true;
	}

	async function saveRating(rating: number) {
		const prev = userRating;
		onRatingChanged(placeId, rating);
		editorOpen = false;

		const { error } = await supabase
			.from('places')
			.update({ user_rating: rating, user_rated_at: new Date().toISOString() })
			.eq('id', placeId);

		if (error) {
			onRatingChanged(placeId, prev);
		}
	}

	async function clearRating() {
		const prev = userRating;
		onRatingChanged(placeId, null);
		editorOpen = false;

		const { error } = await supabase
			.from('places')
			.update({ user_rating: null, user_rated_at: null })
			.eq('id', placeId);

		if (error) {
			onRatingChanged(placeId, prev);
		}
	}

	function closeEditor() {
		editorOpen = false;
	}
</script>

<button
	bind:this={triggerEl}
	onclick={openEditor}
	class="shrink-0 rounded-md px-1 py-0.5 text-right transition-colors hover:bg-warm-100 {compact ? 'text-[11px]' : 'text-sm'}"
	aria-label="Set rating"
>
	{#if userRating != null}
		<span class="font-extrabold text-warm-700">{userRating.toFixed(1)}</span><span class="text-brand-500 {compact ? 'text-[10px]' : 'text-xs'}">★</span>
	{:else}
		<span class="font-medium text-warm-300 {compact ? 'text-[10px]' : 'text-xs'}">Not rated</span>
	{/if}
</button>

{#if editorOpen}
	<RatingEditor
		value={userRating}
		{anchorRect}
		onSave={saveRating}
		onClear={clearRating}
		onClose={closeEditor}
	/>
{/if}
