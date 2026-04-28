<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import type { PlacePhoto } from '$lib/types/database';
	import { uploadPlacePhoto, deletePlacePhoto, loadPlacePhotos, validateFile } from '$lib/photo-storage';
	import { sortable } from '$lib/actions/sortable';
	import PhotoLightbox from './PhotoLightbox.svelte';
	import { mount, unmount } from 'svelte';

	interface Props {
		supabase: SupabaseClient;
		placeId: string;
		userId: string;
		compact?: boolean;
	}

	let { supabase, placeId, userId, compact = false }: Props = $props();

	let photos = $state<{ photo: PlacePhoto; publicUrl: string }[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let lightboxIndex = $state<number | null>(null);
	let lightboxOriginRect = $state<DOMRect | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let containerWidth = $state(0);
	let thumbEls = $state<Map<string, HTMLElement>>(new Map());

	let lightboxUrls = $derived(photos.map((p) => p.publicUrl));

	const DEFAULT_ASPECT = 4 / 3;

	function getAspect(p: PlacePhoto): number {
		if (p.width && p.height && p.height > 0) return p.width / p.height;
		return DEFAULT_ASPECT;
	}

	$effect(() => {
		let cancelled = false;
		loading = true;
		error = null;
		loadPlacePhotos(supabase, placeId)
			.then((data) => { if (!cancelled) photos = data; })
			.catch((e) => { if (!cancelled) error = e.message; })
			.finally(() => { if (!cancelled) loading = false; });
		return () => { cancelled = true; };
	});

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) containerWidth = entry.contentRect.width;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	function triggerUpload(e: MouseEvent) {
		e.stopPropagation();
		fileInput?.click();
	}

	async function handleFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files?.length) return;

		error = null;
		uploading = true;

		for (const file of Array.from(files)) {
			const validationError = validateFile(file);
			if (validationError) { error = validationError; continue; }
			try {
				const result = await uploadPlacePhoto(supabase, userId, placeId, file);
				photos = [...photos, result];
			} catch (e: any) {
				error = e.message;
			}
		}

		uploading = false;
		input.value = '';
	}

	async function handleDelete(index: number) {
		const item = photos[index];
		if (!item) return;
		try {
			await deletePlacePhoto(supabase, item.photo.id, item.photo.storage_path);
			photos = photos.filter((_, i) => i !== index);
			if (photos.length === 0) lightboxIndex = null;
			else if (lightboxIndex !== null && lightboxIndex >= photos.length) lightboxIndex = photos.length - 1;
		} catch (e: any) {
			error = e.message;
		}
	}

	async function handleReorder(orderedIds: string[]) {
		const reordered = orderedIds
			.map((id) => photos.find((p) => p.photo.id === id))
			.filter((p): p is { photo: PlacePhoto; publicUrl: string } => !!p);
		photos = reordered;

		const rows = orderedIds.map((id, i) => ({ id, sort_order: i }));
		await supabase.from('place_photos').upsert(rows, { onConflict: 'id' });
	}

	function openLightbox(index: number, e: MouseEvent) {
		e.stopPropagation();
		const el = thumbEls.get(photos[index]?.photo.id);
		lightboxOriginRect = el ? el.getBoundingClientRect() : null;
		lightboxIndex = index;
	}

	function registerThumbAction(el: HTMLElement, id: string) {
		thumbEls.set(id, el);
		return {
			update(newId: string) {
				thumbEls.delete(id);
				id = newId;
				thumbEls.set(id, el);
			},
			destroy() {
				thumbEls.delete(id);
			},
		};
	}

	let lightboxInstance: Record<string, any> | null = null;
	let lightboxContainer: HTMLDivElement | null = null;

	function closeLightbox() {
		lightboxIndex = null;
		lightboxOriginRect = null;
	}

	$effect(() => {
		if (lightboxIndex !== null && lightboxUrls.length > 0) {
			const container = document.createElement('div');
			document.body.appendChild(container);
			lightboxContainer = container;

			const idx = lightboxIndex;
			const rect = lightboxOriginRect;

			lightboxInstance = mount(PhotoLightbox, {
				target: container,
				props: {
					urls: lightboxUrls,
					startIndex: idx,
					originRect: rect,
					onClose: closeLightbox,
					onDelete: handleDelete,
				},
			});
		}

		return () => {
			if (lightboxInstance) {
				unmount(lightboxInstance);
				lightboxInstance = null;
			}
			if (lightboxContainer) {
				lightboxContainer.remove();
				lightboxContainer = null;
			}
		};
	});

	function handleImageLoad(e: Event) {
		const img = e.target as HTMLImageElement;
		img.style.opacity = '1';
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept="image/jpeg,image/png,image/webp,image/heic"
	multiple
	class="hidden"
	onchange={handleFiles}
/>

{#if loading}
	<div class="flex items-center justify-center py-4">
		<svg class="h-4 w-4 animate-spin text-warm-400" viewBox="0 0 24 24" fill="none">
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
			<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	</div>
{:else if compact}
	<!-- Horizontal row for mobile: aspect-ratio preserved thumbnails -->
	<div class="flex items-center gap-1.5 overflow-x-auto">
		{#each photos as item, i (item.photo.id)}
			{@const aspect = getAspect(item.photo)}
			<button
				onclick={(e) => openLightbox(i, e)}
				class="relative h-12 shrink-0 overflow-hidden rounded-lg border border-warm-200 transition-shadow hover:shadow-md"
				style="width: {Math.round(48 * aspect)}px"
				use:registerThumbAction={item.photo.id}
			>
				<div class="absolute inset-0 bg-warm-200 rounded-lg"></div>
				<img
					src={item.publicUrl}
					alt=""
					class="relative h-full w-full object-cover transition-opacity duration-150"
					style="opacity: 0"
					onload={handleImageLoad}
					loading="lazy"
				/>
			</button>
		{/each}
		<button
			onclick={triggerUpload}
			disabled={uploading}
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-warm-300 text-warm-400 transition-colors hover:border-brand-400 hover:text-brand-500 disabled:opacity-50"
			aria-label="Add photo"
		>
			{#if uploading}
				<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			{:else}
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			{/if}
		</button>
	</div>
{:else}
	<!-- Grid layout with drag-to-reorder for modal -->
	<div
		bind:this={containerEl}
		class="flex flex-wrap gap-2"
		use:sortable={{
			onReorder: handleReorder,
			itemSelector: '[data-photo-id]',
			idAttribute: 'data-photo-id',
			longPressMs: 300,
			disabled: photos.length < 2,
			ignoreDragFrom: 'button[aria-label="Add photo"]',
		}}
	>
		{#each photos as item, i (item.photo.id)}
			<button
				data-photo-id={item.photo.id}
				onclick={(e) => openLightbox(i, e)}
				class="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-warm-200 transition-shadow hover:shadow-md"
				use:registerThumbAction={item.photo.id}
			>
				<div class="absolute inset-0 rounded-lg bg-warm-200"></div>
				<img
					src={item.publicUrl}
					alt=""
					draggable="false"
					class="relative h-full w-full object-cover transition-opacity duration-150"
					style="opacity: 0"
					onload={handleImageLoad}
					loading="lazy"
				/>
			</button>
		{/each}
		<button
			onclick={triggerUpload}
			disabled={uploading}
			class="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-warm-300 text-warm-400 transition-colors hover:border-brand-400 hover:text-brand-500 disabled:opacity-50"
			aria-label="Add photo"
		>
			{#if uploading}
				<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
			{:else}
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			{/if}
		</button>
	</div>
	{#if photos.length >= 2}
		<p class="mt-2 text-center text-[10px] font-medium text-warm-400">Drag to reorder</p>
	{/if}
{/if}

{#if error}
	<p class="mt-1 text-xs text-danger-600">{error}</p>
{/if}
