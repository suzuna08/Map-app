<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		value: number | null;
		anchorRect: { top: number; left: number; width: number; height: number; bottom: number };
		onSave: (rating: number) => void;
		onClear: () => void;
		onClose: () => void;
	}

	let { value, anchorRect, onSave, onClear, onClose }: Props = $props();

	let scrubberEl = $state<HTMLDivElement | null>(null);
	let preview = $state<number | null>(null);
	let dragging = $state(false);
	let mounted = $state(false);

	let wrapperEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		if (wrapperEl) {
			document.body.appendChild(wrapperEl);
			mounted = true;
		}
		return () => {
			wrapperEl?.remove();
		};
	});

	const STAR_COUNT = 5;
	const STAR_W = 28;
	const GAP = 2;
	const TOTAL_W = STAR_COUNT * STAR_W + (STAR_COUNT - 1) * GAP;

	function posToRating(clientX: number): number {
		if (!scrubberEl) return 0.5;
		const rect = scrubberEl.getBoundingClientRect();
		const x = clientX - rect.left;
		const ratio = Math.max(0, Math.min(1, x / TOTAL_W));
		const raw = ratio * STAR_COUNT;
		return Math.max(0.5, Math.round(raw * 2) / 2);
	}

	function onPointerDown(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragging = true;
		preview = posToRating(e.clientX);
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		e.preventDefault();
		preview = posToRating(e.clientX);
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		e.preventDefault();
		e.stopPropagation();
		dragging = false;
		const finalRating = posToRating(e.clientX);
		preview = null;
		onSave(finalRating);
	}

	function handleStarClick(e: MouseEvent, starIndex: number) {
		e.preventDefault();
		e.stopPropagation();
		if (!scrubberEl) return;
		const rect = scrubberEl.getBoundingClientRect();
		const starLeft = starIndex * (STAR_W + GAP);
		const localX = e.clientX - rect.left - starLeft;
		const isLeftHalf = localX < STAR_W / 2;
		const rating = starIndex + (isLeftHalf ? 0.5 : 1.0);
		onSave(rating);
	}

	let displayRating = $derived(preview ?? value ?? 0);

	function starFill(starIndex: number): 'full' | 'half' | 'empty' {
		const starNum = starIndex + 1;
		if (displayRating >= starNum) return 'full';
		if (displayRating >= starNum - 0.5) return 'half';
		return 'empty';
	}

	let popoverStyle = $derived.by(() => {
		const editorW = TOTAL_W + 24;
		let left = anchorRect.left + anchorRect.width / 2 - editorW / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - editorW - 8));
		const top = anchorRect.bottom + 6;
		return `position:fixed;left:${left}px;top:${top}px;width:${editorW}px;z-index:9999`;
	});

	function handleBackdrop(e: MouseEvent) {
		e.stopPropagation();
		onClose();
	}
</script>

<!-- 
  Single wrapper that gets teleported to document.body via onMount.
  Hidden until teleport completes to avoid a flash inside the card.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={wrapperEl} style={mounted ? '' : 'display:none'}>
	<!-- Backdrop -->
	<div
		class="fixed inset-0"
		style="z-index:9998"
		onclick={handleBackdrop}
	></div>

	<!-- Popover -->
	<div
		class="rounded-xl border border-warm-200 bg-white p-3 shadow-xl"
		style={popoverStyle}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Star scrubber area -->
		<div
			bind:this={scrubberEl}
			class="flex select-none items-center justify-center gap-[2px]"
			style="touch-action:none"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			role="slider"
			tabindex="0"
			aria-label="Rate this place"
			aria-valuemin={0}
			aria-valuemax={5}
			aria-valuenow={displayRating}
		>
			{#each Array(STAR_COUNT) as _, i}
				{@const fill = starFill(i)}
				<svg
					class="h-7 w-7 cursor-pointer transition-colors {dragging ? '' : 'hover:scale-110'}"
					viewBox="0 0 24 24"
					onclick={(e) => handleStarClick(e, i)}
				>
					<defs>
						<clipPath id="star-left-{i}">
							<rect x="0" y="0" width="12" height="24" />
						</clipPath>
						<clipPath id="star-right-{i}">
							<rect x="12" y="0" width="12" height="24" />
						</clipPath>
					</defs>
					{#if fill === 'full'}
						<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#f59e0b" />
					{:else if fill === 'half'}
						<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#f59e0b" clip-path="url(#star-left-{i})" />
						<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#e5e0d8" clip-path="url(#star-right-{i})" />
					{:else}
						<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#e5e0d8" />
					{/if}
				</svg>
			{/each}
		</div>

		<!-- Value label + clear -->
		<div class="mt-1.5 flex items-center justify-between">
			<span class="text-xs font-bold text-warm-600">
				{#if displayRating > 0}
					{displayRating.toFixed(1)}
				{:else}
					Tap or drag
				{/if}
			</span>
			{#if value != null}
				<button
					onclick={(e) => { e.stopPropagation(); onClear(); }}
					class="text-xs font-semibold text-warm-400 transition-colors hover:text-danger-600"
				>
					Clear
				</button>
			{/if}
		</div>
	</div>
</div>
