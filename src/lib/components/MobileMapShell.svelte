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

	let isExpanded = $state(false);

	const COLLAPSED_PX = 128;

	function toggle() {
		isExpanded = !isExpanded;
	}
</script>

<div
	class="mobile-map-shell relative w-full shrink-0 overflow-hidden border-b border-warm-200 bg-warm-100"
	style="height: {isExpanded ? '42vh' : `${COLLAPSED_PX}px`}"
>
	<!-- Map always renders at expanded height; outer container clips it -->
	<div class="absolute inset-x-0 top-0 w-full" style="height: 42vh">
		<MapView {places} {selectedPlaceId} {onPlaceSelect} {maptilerKey} />
	</div>

	<button
		class="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-0.5 bg-gradient-to-t from-white/80 via-white/40 to-transparent pb-1.5 pt-3"
		onclick={toggle}
		aria-label={isExpanded ? 'Collapse map' : 'Expand map'}
	>
		<div class="h-1 w-9 rounded-full bg-warm-400/60"></div>
		<span class="text-[9px] font-medium text-warm-500">
			{isExpanded ? 'Collapse' : 'Expand'}
		</span>
	</button>
</div>

<style>
	.mobile-map-shell {
		transition: height 200ms ease-in-out;
	}
</style>
