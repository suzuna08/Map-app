<script lang="ts">
	interface Props {
		anchorX: number;
		anchorY: number;
		onRemoveFromCollection: () => void;
		onDeletePlace: () => void;
		onClose: () => void;
	}

	let { anchorX, anchorY, onRemoveFromCollection, onDeletePlace, onClose }: Props = $props();

	let isMobile = $state(false);
	let menuEl = $state<HTMLDivElement | null>(null);
	let confirmingDelete = $state(false);
	let menuStyle = $state('');

	$effect(() => {
		isMobile = window.innerWidth < 640;
	});

	$effect(() => {
		if (!menuEl || isMobile) return;

		const rect = menuEl.getBoundingClientRect();
		let x = anchorX;
		let y = anchorY + 4;

		if (x + rect.width > window.innerWidth - 8) {
			x = anchorX - rect.width;
		}
		if (y + rect.height > window.innerHeight - 8) {
			y = anchorY - rect.height - 4;
		}

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
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={onClose}>
	{#if isMobile}
		<!-- Mobile: bottom action sheet -->
		<div class="absolute inset-0 bg-warm-900/30 backdrop-blur-[2px]"></div>
		<div
			class="absolute inset-x-0 bottom-0 z-10 animate-in rounded-t-2xl border-t border-warm-200 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-xl"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="mx-auto mt-2 h-1 w-10 rounded-full bg-warm-200"></div>
			<div class="px-4 pb-2 pt-4">
				{#if confirmingDelete}
					<p class="mb-3 text-center text-sm font-medium text-warm-700">Delete this place permanently?</p>
					<button
						onclick={handleDelete}
						class="flex w-full items-center justify-center gap-2 rounded-xl bg-danger-500 px-4 py-3 text-sm font-bold text-white transition-colors active:bg-danger-600"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
						Delete
					</button>
					<button
						onclick={handleCancelDelete}
						class="mt-2 flex w-full items-center justify-center rounded-xl bg-warm-100 px-4 py-3 text-sm font-semibold text-warm-600 transition-colors active:bg-warm-200"
					>
						Cancel
					</button>
				{:else}
					<button
						onclick={handleRemove}
						class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors active:bg-warm-50"
					>
						<svg class="h-4.5 w-4.5 shrink-0 text-warm-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
						<div>
							<p class="text-sm font-semibold text-warm-800">Remove from collection</p>
							<p class="text-[11px] text-warm-400">Place stays in your library</p>
						</div>
					</button>
					<button
						onclick={handleDelete}
						class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors active:bg-danger-50"
					>
						<svg class="h-4.5 w-4.5 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
						</svg>
						<div>
							<p class="text-sm font-semibold text-danger-600">Delete place</p>
							<p class="text-[11px] text-warm-400">Permanently remove from everywhere</p>
						</div>
					</button>
				{/if}
			</div>
			<div class="px-4 pb-3 pt-1">
				{#if !confirmingDelete}
					<button
						onclick={onClose}
						class="flex w-full items-center justify-center rounded-xl bg-warm-100 px-4 py-3 text-sm font-semibold text-warm-600 transition-colors active:bg-warm-200"
					>
						Cancel
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Desktop: dropdown menu -->
		<div
			bind:this={menuEl}
			class="fixed z-10 w-56 rounded-xl border border-warm-200 bg-white py-1.5 shadow-lg shadow-warm-900/10"
			style={menuStyle}
			onclick={(e) => e.stopPropagation()}
		>
			{#if confirmingDelete}
				<div class="px-3 py-2">
					<p class="text-xs font-medium text-warm-600">Delete this place permanently?</p>
					<div class="mt-2 flex items-center justify-end gap-1.5">
						<button
							onclick={handleCancelDelete}
							class="rounded-md px-2.5 py-1 text-[11px] font-medium text-warm-500 hover:bg-warm-100"
						>
							Cancel
						</button>
						<button
							onclick={handleDelete}
							class="rounded-md bg-danger-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-danger-700"
						>
							Delete
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
					<span class="text-[13px] font-medium text-warm-700">Remove from collection</span>
				</button>
				<button
					onclick={handleDelete}
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-danger-50"
				>
					<svg class="h-3.5 w-3.5 shrink-0 text-danger-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
					<span class="text-[13px] font-medium text-danger-600">Delete place</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
