<script lang="ts">
	import { browser } from '$app/environment';
	import { bottomDockSuppressed } from '$lib/stores/bottom-dock-suppressed';
	import { t } from '$lib/i18n/locale.svelte';

	interface Props {
		anchorX: number;
		anchorY: number;
		onRemoveFromCollection: () => void;
		onDeletePlace: () => void;
		onClose: () => void;
	}

	let { anchorX, anchorY, onRemoveFromCollection, onDeletePlace, onClose }: Props = $props();

	let menuEl = $state<HTMLDivElement | null>(null);
	let confirmingDelete = $state(false);
	let menuStyle = $state('');

	$effect(() => {
		if (!menuEl) return;

		const rect = menuEl.getBoundingClientRect();
		let x = anchorX;
		let y = anchorY + 4;

		if (x + rect.width > window.innerWidth - 8) {
			x = anchorX - rect.width;
		}
		if (y + rect.height > window.innerHeight - 8) {
			y = anchorY - rect.height - 4;
		}
		if (x < 8) x = 8;

		menuStyle = `left:${x}px;top:${y}px`;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function handleRemove() {
		onRemoveFromCollection();
		onClose();
	}

	function handleDelete() {
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		onDeletePlace();
		onClose();
	}

	function handleCancelDelete() {
		confirmingDelete = false;
	}

	$effect(() => {
		if (!browser) return;
		bottomDockSuppressed.set(true);
		return () => bottomDockSuppressed.set(false);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-[60]" onclick={onClose}>
	<div
		bind:this={menuEl}
		class="fixed z-10 w-56 rounded-xl border border-warm-200 bg-white py-1.5 shadow-lg shadow-warm-900/10"
		style={menuStyle}
		onclick={(e) => e.stopPropagation()}
	>
		{#if confirmingDelete}
			<div class="px-3 py-2">
				<p class="text-xs font-medium text-warm-600">{t('placeAction.deleteConfirmPermanent')}</p>
				<div class="mt-2 flex items-center justify-end gap-1.5">
					<button
						onclick={handleCancelDelete}
						class="rounded-md px-2.5 py-1 text-xs font-medium text-warm-500 hover:bg-warm-100"
					>
						{t('common.cancel')}
					</button>
					<button
						onclick={handleDelete}
						class="rounded-md bg-danger-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-danger-700"
					>
						{t('common.delete')}
					</button>
				</div>
			</div>
		{:else}
			<button
				onclick={handleRemove}
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-warm-50"
			>
				<svg class="h-3.5 w-3.5 shrink-0 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
				<span class="text-sm font-medium text-warm-700">{t('placeAction.removeFromCollection')}</span>
			</button>
			<button
				onclick={handleDelete}
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-danger-50"
			>
				<svg class="h-3.5 w-3.5 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
				<span class="text-sm font-medium text-danger-600">{t('placeAction.deletePlace')}</span>
			</button>
		{/if}
	</div>
</div>
