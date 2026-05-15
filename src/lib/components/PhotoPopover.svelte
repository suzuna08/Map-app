<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import PhotoGrid from './PhotoGrid.svelte';

	interface Props {
		supabase: SupabaseClient;
		placeId: string;
		userId: string;
		placeTitle: string;
		onClose: () => void;
	}

	let { supabase, placeId, userId, placeTitle, onClose }: Props = $props();

	let popoverEl = $state<HTMLDivElement | null>(null);

	function handleBackdropClick(e: MouseEvent) {
		if (popoverEl && !popoverEl.contains(e.target as Node)) {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[60]" onclick={handleBackdropClick}>
	<div
		bind:this={popoverEl}
		class="photo-popover fixed z-[61] flex flex-col border border-warm-200 bg-white shadow-xl
			max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[60dvh] max-sm:rounded-t-2xl
			sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[400px] sm:max-h-[70dvh] sm:rounded-2xl"
	>
		<div class="flex shrink-0 items-center justify-between border-b border-warm-100 px-4 py-2.5 sm:px-5 sm:py-3">
			<div class="flex items-center gap-2 min-w-0">
				<svg class="h-4 w-4 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
					<circle cx="12" cy="13" r="4"/>
				</svg>
				<h2 class="truncate text-sm font-bold text-warm-800">{placeTitle}</h2>
			</div>
			<button onclick={onClose} class="rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600" aria-label="Close">
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
			<PhotoGrid {supabase} {placeId} {userId} />
		</div>
	</div>
</div>
