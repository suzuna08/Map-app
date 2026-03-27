<script lang="ts">
	import type { Place } from '$lib/types/database';
	import MapView from './MapView.svelte';

	interface Props {
		places: Place[];
		selectedPlaceId: string | null;
		onPlaceSelect: (placeId: string) => void;
		maptilerKey?: string;
	}

	let { places, selectedPlaceId, onPlaceSelect, maptilerKey = '' }: Props = $props();

	const MIN_HEIGHT = 80;
	const DEFAULT_HEIGHT = 128;
	const SNAP_COLLAPSED = 100;
	const SNAP_EXPANDED_VH = 0.55;

	let mapHeight = $state(DEFAULT_HEIGHT);
	let dragging = $state(false);
	let animating = $state(false);

	let dragStartY = 0;
	let dragStartHeight = 0;

	let maxHeight = $derived(typeof window !== 'undefined' ? window.innerHeight * 0.7 : 500);
	let mapMode = $derived<'collapsed' | 'expanded'>(mapHeight > 180 ? 'expanded' : 'collapsed');

	function clampHeight(h: number): number {
		return Math.max(MIN_HEIGHT, Math.min(h, maxHeight));
	}

	function onPointerDown(e: PointerEvent) {
		if (animating) return;
		dragging = true;
		dragStartY = e.clientY;
		dragStartHeight = mapHeight;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const delta = e.clientY - dragStartY;
		mapHeight = clampHeight(dragStartHeight + delta);
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;

		const viewH = window.innerHeight;
		animating = true;
		if (mapHeight < SNAP_COLLAPSED) {
			mapHeight = MIN_HEIGHT;
		} else if (mapHeight > viewH * 0.4) {
			mapHeight = clampHeight(viewH * SNAP_EXPANDED_VH);
		}
		setTimeout(() => { animating = false; }, 220);
	}

	function onDoubleTap() {
		animating = true;
		const viewH = window.innerHeight;
		if (mapHeight > DEFAULT_HEIGHT + 20) {
			mapHeight = DEFAULT_HEIGHT;
		} else {
			mapHeight = clampHeight(viewH * SNAP_EXPANDED_VH);
		}
		setTimeout(() => { animating = false; }, 220);
	}
</script>

<div
	class="relative w-full shrink-0 overflow-hidden border-b border-warm-200 bg-warm-100"
	class:map-animate={animating}
	style="height: {mapHeight}px"
>
	<div class="h-full w-full">
		<MapView {places} {selectedPlaceId} {onPlaceSelect} {maptilerKey} {mapMode} />
	</div>

	<!-- Drag handle -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="absolute inset-x-0 bottom-0 z-10 flex cursor-row-resize touch-none flex-col items-center pb-1 pt-2"
		class:bg-warm-200={dragging}
		style="background: {dragging ? '' : 'linear-gradient(to top, rgba(255,255,255,0.85), rgba(255,255,255,0.3), transparent)'}"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		ondblclick={onDoubleTap}
	>
		<div class="h-1 w-10 rounded-full {dragging ? 'bg-brand-500' : 'bg-warm-400/60'}"></div>
	</div>
</div>

<style>
	.map-animate {
		transition: height 200ms ease-out;
	}
</style>
