<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/types/database';

	interface Props {
		places: Place[];
		selectedPlaceId: string | null;
		onPlaceSelect: (placeId: string) => void;
		maptilerKey?: string;
		mapMode?: 'collapsed' | 'expanded' | 'default';
	}

	let { places, selectedPlaceId, onPlaceSelect, maptilerKey = '', mapMode = 'default' }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let map: any = null;
	let ml: any = null;
	let markersMap = new Map<string, { marker: any; el: HTMLDivElement }>();
	let mapReady = $state(false);
	let prevFitKey = '';
	let mounted = $state(false);

	const HANDLE_PX = 24;

	function getFrameOffset(): [number, number] {
		if (mapMode === 'collapsed') return [0, -(HANDLE_PX / 2)];
		return [0, 0];
	}

	function getFramePadding(): number | { top: number; bottom: number; left: number; right: number } {
		if (mapMode === 'collapsed') return { top: 8, bottom: HANDLE_PX + 8, left: 12, right: 12 };
		return 50;
	}

	onMount(() => {
		let ro: ResizeObserver | null = null;
		mounted = true;

		const key = maptilerKey || import.meta.env.PUBLIC_MAPTILER_KEY || '';

		(async () => {
			const mod = await import('maplibre-gl');
			ml = mod.default ?? mod;
			if (!container) return;

			const style = key
				? `https://api.maptiler.com/maps/pastel/style.json?key=${key}`
				: 'https://demotiles.maplibre.org/style.json';

			map = new ml.Map({
				container,
				style,
				center: [0, 20],
				zoom: 2,
				attributionControl: false,
			});

			map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
			map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');

			map.on('load', () => {
				mapReady = true;
				syncMarkers();
				fitToMarkers(false);
			});

			ro = new ResizeObserver(() => map?.resize());
			ro.observe(container);
		})();

		return () => {
			ro?.disconnect();
			map?.remove();
			map = null;
			mapReady = false;
		};
	});

	$effect(() => {
		if (!mapReady || !map) return;
		const _p = places;
		syncMarkers();

		const fitKey = places
			.filter(p => p.lat != null && p.lng != null)
			.map(p => p.id)
			.sort()
			.join(',');
		if (fitKey !== prevFitKey) {
			prevFitKey = fitKey;
			fitToMarkers(true);
		}
	});

	$effect(() => {
		if (!mapReady || !map) return;
		const sid = selectedPlaceId;
		const offset = getFrameOffset();
		const mode = mapMode;

		markersMap.forEach((entry, id) => {
			entry.el.classList.toggle('map-marker--selected', id === sid);
		});

		if (sid) {
			const entry = markersMap.get(sid);
			if (entry) {
				const lngLat = entry.marker.getLngLat();
				map.flyTo({
					center: [lngLat.lng, lngLat.lat],
					zoom: Math.max(map.getZoom(), 13),
					duration: 600,
					offset,
				});
				if (mode === 'collapsed') {
					if (entry.marker.getPopup().isOpen()) entry.marker.togglePopup();
				} else {
					if (!entry.marker.getPopup().isOpen()) entry.marker.togglePopup();
				}
			}
			markersMap.forEach((e, id) => {
				if (id !== sid && e.marker.getPopup().isOpen()) e.marker.togglePopup();
			});
		}
	});

	function syncMarkers() {
		if (!map || !ml) return;
		const currentIds = new Set(
			places.filter(p => p.lat != null && p.lng != null).map(p => p.id)
		);

		for (const [id, entry] of markersMap) {
			if (!currentIds.has(id)) {
				entry.marker.remove();
				markersMap.delete(id);
			}
		}

		for (const place of places) {
			if (place.lat == null || place.lng == null) continue;

			if (markersMap.has(place.id)) {
				markersMap.get(place.id)!.marker.setLngLat([place.lng, place.lat]);
			} else {
				const el = createMarkerEl(place);
				const popup = new ml.Popup({
					offset: 20,
					closeButton: false,
					closeOnClick: false,
					maxWidth: '220px',
					className: 'map-popup-warm',
				}).setHTML(popupHtml(place));

				const marker = new ml.Marker({ element: el })
					.setLngLat([place.lng, place.lat])
					.setPopup(popup)
					.addTo(map);

				const placeId = place.id;
				el.addEventListener('click', (e: MouseEvent) => {
					e.stopPropagation();
					onPlaceSelect(placeId);
				});
				el.addEventListener('mouseenter', () => {
					if (mapMode !== 'collapsed' && !marker.getPopup().isOpen()) marker.togglePopup();
				});
				el.addEventListener('mouseleave', () => {
					if (placeId !== selectedPlaceId && marker.getPopup().isOpen()) marker.togglePopup();
				});

				markersMap.set(place.id, { marker, el });
			}
		}
	}

	function createMarkerEl(place: Place): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'map-marker';
		if (place.id === selectedPlaceId) el.classList.add('map-marker--selected');
		el.innerHTML = `<svg width="24" height="32" viewBox="0 0 24 32" fill="none"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z" fill="currentColor"/><circle cx="12" cy="11" r="4.5" fill="white" opacity="0.85"/></svg>`;
		return el;
	}

	function popupHtml(place: Place): string {
		const title = esc(place.title);
		const cat = place.category ? `<div class="map-popup-meta">${esc(place.category)}</div>` : '';
		const rating = place.rating ? `<div class="map-popup-rating">★ ${place.rating.toFixed(1)}</div>` : '';
		return `<div class="map-popup-content"><div class="map-popup-title">${title}</div>${cat}${rating}</div>`;
	}

	function fitToMarkers(animate: boolean) {
		if (!map || !ml) return;
		const coords = places
			.filter(p => p.lat != null && p.lng != null)
			.map(p => [p.lng!, p.lat!] as [number, number]);

		if (coords.length === 0) return;

		const padding = getFramePadding();

		if (coords.length === 1) {
			map[animate ? 'flyTo' : 'jumpTo']({ center: coords[0], zoom: 13, offset: getFrameOffset() });
			return;
		}

		const bounds = new ml.LngLatBounds(coords[0], coords[0]);
		for (const c of coords) bounds.extend(c);
		map.fitBounds(bounds, { padding, animate, maxZoom: 15 });
	}

	function esc(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	let mappableCount = $derived(places.filter(p => p.lat != null && p.lng != null).length);
	let unmappableCount = $derived(places.length - mappableCount);
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" />
</svelte:head>

<div class="relative h-full w-full bg-warm-100">
	<div bind:this={container} class="h-full w-full"></div>

	{#if mounted && !maptilerKey}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-warm-100/90 backdrop-blur-sm">
			<div class="rounded-xl border border-warm-200 bg-white p-6 text-center shadow-sm">
				<svg class="mx-auto mb-3 h-10 w-10 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				<p class="text-sm font-semibold text-warm-700">Map requires setup</p>
				<p class="mt-1 text-xs text-warm-400">Add <code class="rounded bg-warm-100 px-1.5 py-0.5 text-[11px]">PUBLIC_MAPTILER_KEY</code> to your Vercel environment variables, then redeploy</p>
			</div>
		</div>
	{/if}

	{#if unmappableCount > 0 && mappableCount > 0}
		<div class="absolute bottom-2 left-2 z-10 rounded-lg bg-white/90 px-2.5 py-1.5 text-[10px] font-medium text-warm-500 shadow-sm backdrop-blur-sm sm:text-xs">
			{mappableCount} on map · {unmappableCount} without coordinates
		</div>
	{:else if mappableCount === 0 && places.length > 0}
		<div class="absolute inset-x-0 bottom-4 z-10 text-center">
			<span class="inline-block rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-warm-500 shadow-sm backdrop-blur-sm">
				No places with coordinates to display
			</span>
		</div>
	{/if}
</div>
