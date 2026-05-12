<script lang="ts">
	import type { Place } from '$lib/types/database';
	import type { Snippet } from 'svelte';
	import MapView from './MapView.svelte';

	interface Props {
		places: Place[];
		selectedPlaceId: string | null;
		recenterTick?: number;
		onPlaceSelect: (placeId: string) => void;
		onPopupPhotoAction?: (placeId: string) => void;
		onPopupPhotoClick?: (placeId: string, photoIndex: number) => void;
		maptilerKey?: string;
		placePhotos?: Record<string, string[]>;
		peekFraction?: number;
		fullFraction?: number;
		header?: Snippet;
		children?: Snippet;
	}

	let { places, selectedPlaceId, recenterTick = 0, onPlaceSelect, onPopupPhotoAction, onPopupPhotoClick, maptilerKey = '', placePhotos = {}, peekFraction = 0.25, fullFraction = 0.9, header, children }: Props = $props();

	const SNAP_PEEK = peekFraction;
	const SNAP_HALF = 0.55;
	const SNAP_FULL = fullFraction;

	let sheetEl = $state<HTMLDivElement | null>(null);
	let contentEl = $state<HTMLDivElement | null>(null);
	let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
	let sheetFraction = $state(SNAP_HALF);
	let dragging = $state(false);
	let animating = $state(false);

	let dragStartY = 0;
	let dragStartFraction = 0;
	let dragVelocity = 0;
	let lastDragY = 0;
	let lastDragTime = 0;

	let sheetHeight = $derived(Math.round(vh * sheetFraction));
	let mapPaddingBottom = $derived(sheetHeight);

	$effect(() => {
		function onResize() {
			vh = window.innerHeight;
		}
		window.addEventListener('resize', onResize);
		window.visualViewport?.addEventListener('resize', () => {
			vh = window.visualViewport?.height ?? window.innerHeight;
		});
		return () => {
			window.removeEventListener('resize', onResize);
		};
	});

	function clampFraction(f: number): number {
		return Math.max(SNAP_PEEK, Math.min(SNAP_FULL, f));
	}

	function snapToNearest(f: number, velocity: number): number {
		const snaps = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];

		if (Math.abs(velocity) > 0.5) {
			if (velocity > 0) {
				// Swiping up (toward full)
				const above = snaps.filter(s => s > dragStartFraction);
				return above.length > 0 ? above[0] : snaps[snaps.length - 1];
			} else {
				// Swiping down (toward peek)
				const below = snaps.filter(s => s < dragStartFraction);
				return below.length > 0 ? below[below.length - 1] : snaps[0];
			}
		}

		let closest = snaps[0];
		let minDist = Math.abs(f - closest);
		for (const s of snaps) {
			const dist = Math.abs(f - s);
			if (dist < minDist) {
				minDist = dist;
				closest = s;
			}
		}
		return closest;
	}

	function onHandlePointerDown(e: PointerEvent) {
		if (animating) return;
		dragging = true;
		dragStartY = e.clientY;
		dragStartFraction = sheetFraction;
		dragVelocity = 0;
		lastDragY = e.clientY;
		lastDragTime = Date.now();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onHandlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const deltaY = dragStartY - e.clientY;
		const deltaFraction = deltaY / vh;
		sheetFraction = clampFraction(dragStartFraction + deltaFraction);

		const now = Date.now();
		const dt = now - lastDragTime;
		if (dt > 0) {
			const dy = lastDragY - e.clientY;
			dragVelocity = (dy / vh) / (dt / 1000);
		}
		lastDragY = e.clientY;
		lastDragTime = now;
	}

	function onHandlePointerUp() {
		if (!dragging) return;
		dragging = false;
		animating = true;
		sheetFraction = snapToNearest(sheetFraction, dragVelocity);
		setTimeout(() => { animating = false; }, 320);
	}

	let scrollDragActive = false;
	let scrollDragStartY = 0;

	function onContentTouchStart(e: TouchEvent) {
		if (!contentEl || sheetFraction < SNAP_FULL - 0.05) return;
		if (contentEl.scrollTop <= 0) {
			scrollDragActive = true;
			scrollDragStartY = e.touches[0].clientY;
			dragStartFraction = sheetFraction;
			dragVelocity = 0;
			lastDragY = e.touches[0].clientY;
			lastDragTime = Date.now();
		}
	}

	function onContentTouchMove(e: TouchEvent) {
		if (!scrollDragActive) return;
		const currentY = e.touches[0].clientY;
		const delta = currentY - scrollDragStartY;

		if (delta > 0 && contentEl && contentEl.scrollTop <= 0) {
			e.preventDefault();
			dragging = true;
			const deltaFraction = (scrollDragStartY - currentY) / vh;
			sheetFraction = clampFraction(dragStartFraction + deltaFraction);

			const now = Date.now();
			const dt = now - lastDragTime;
			if (dt > 0) {
				const dy = lastDragY - currentY;
				dragVelocity = (dy / vh) / (dt / 1000);
			}
			lastDragY = currentY;
			lastDragTime = now;
		} else if (delta < 0) {
			scrollDragActive = false;
		}
	}

	function onContentTouchEnd() {
		if (scrollDragActive && dragging) {
			dragging = false;
			animating = true;
			sheetFraction = snapToNearest(sheetFraction, dragVelocity);
			setTimeout(() => { animating = false; }, 320);
		}
		scrollDragActive = false;
	}
</script>

<!-- Full-screen map background -->
<div class="fixed inset-0 z-0">
	<MapView
		{places}
		{selectedPlaceId}
		{recenterTick}
		{onPlaceSelect}
		{onPopupPhotoAction}
		{onPopupPhotoClick}
		{maptilerKey}
		mapMode="expanded"
		mapHeight={vh}
		{placePhotos}
		mapPaddingBottom={sheetHeight}
	/>
</div>

<!-- Bottom sheet overlay -->
<div
	bind:this={sheetEl}
	class="fixed inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-2xl bg-sage-100 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
	class:sheet-animate={animating && !dragging}
	style="height: {sheetHeight}px; transform: translateY(0);"
>
	<!-- Drag handle area -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex shrink-0 cursor-grab touch-none flex-col items-center px-4 pb-2 pt-3 active:cursor-grabbing"
		class:bg-warm-100={dragging}
		onpointerdown={onHandlePointerDown}
		onpointermove={onHandlePointerMove}
		onpointerup={onHandlePointerUp}
		onpointercancel={onHandlePointerUp}
	>
		<div class="h-1 w-10 rounded-full {dragging ? 'bg-brand-500' : 'bg-warm-400/60'}"></div>
	</div>

	<!-- Non-scrollable header area -->
	{#if header}
		<div class="shrink-0">
			{@render header()}
		</div>
	{/if}

	<!-- Sheet content (scrollable) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={contentEl}
		class="min-h-0 flex-1 overflow-y-auto overscroll-y-none"
		ontouchstart={onContentTouchStart}
		ontouchmove={onContentTouchMove}
		ontouchend={onContentTouchEnd}
	>
		{@render children?.()}
	</div>
</div>

<style>
	.sheet-animate {
		transition: height 300ms cubic-bezier(0.25, 1, 0.5, 1);
	}
</style>
