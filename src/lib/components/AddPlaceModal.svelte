<script lang="ts">
	import type { Place } from '$lib/types/database';

	interface Props {
		onClose: () => void;
		onPlaceAdded?: (place: Place) => void;
	}

	let { onClose, onPlaceAdded }: Props = $props();

	let activeTab = $state<'url' | 'upload'>('url');
	let urlInput = $state('');
	let status = $state<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
	let resultPlace = $state<Place | null>(null);
	let errorMessage = $state('');

	interface IntelSuggestions {
		primary_category: string;
		operational_status: string;
		market_niche: string;
		discussion_pillar: string | null;
		suggested_tags: string[];
	}
	let intelSuggestions = $state<IntelSuggestions | null>(null);

	async function handleSubmit() {
		const trimmed = urlInput.trim();
		if (!trimmed) return;

		status = 'loading';
		errorMessage = '';
		resultPlace = null;
		intelSuggestions = null;

		try {
			const res = await fetch('/api/places/add-by-url', {
				method: 'POST',
				cache: 'no-store',
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache'
				},
				body: JSON.stringify({ url: trimmed })
			});

			const data = await res.json();

			if (!res.ok) {
				status = 'error';
				errorMessage = data.message || data.error?.message || 'Something went wrong';
				return;
			}

			resultPlace = data.place as Place;

			if (data.intel) {
				intelSuggestions = data.intel as IntelSuggestions;
			}

			if (data.duplicate) {
				status = 'duplicate';
			} else {
				status = 'success';
				onPlaceAdded?.(data.place as Place);
			}
		} catch {
			status = 'error';
			errorMessage = 'Network error. Please check your connection and try again.';
		}
	}

	function reset() {
		urlInput = '';
		status = 'idle';
		resultPlace = null;
		intelSuggestions = null;
		errorMessage = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
	onclick={handleBackdrop}
>
	<div class="w-full max-w-lg rounded-2xl border border-warm-200 bg-white shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-warm-100 px-5 py-4">
			<h2 class="text-base font-extrabold text-warm-800">Add Place</h2>
			<button
				onclick={onClose}
				class="rounded-lg p-1.5 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
				aria-label="Close"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-warm-100">
			<button
				onclick={() => { activeTab = 'url'; }}
				class="flex-1 py-3 text-center text-xs font-bold transition-colors {activeTab === 'url'
					? 'border-b-2 border-brand-600 text-brand-700'
					: 'text-warm-400 hover:text-warm-600'}"
			>
				Paste URL
			</button>
			<button
				onclick={() => { activeTab = 'upload'; }}
				class="flex-1 py-3 text-center text-xs font-bold transition-colors {activeTab === 'upload'
					? 'border-b-2 border-brand-600 text-brand-700'
					: 'text-warm-400 hover:text-warm-600'}"
			>
				Upload CSV
			</button>
		</div>

		<!-- Tab content -->
		<div class="p-5">
			{#if activeTab === 'url'}
				<!-- URL Tab -->
				{#if status === 'idle' || status === 'error'}
					<p class="mb-3 text-xs text-warm-500">
						Paste a Google Maps link to quickly add a single place.
					</p>
					<div class="flex gap-2">
						<input
							type="url"
							bind:value={urlInput}
							placeholder="https://maps.google.com/..."
							class="flex-1 rounded-lg border border-warm-200 bg-warm-50 px-3 py-2 text-sm text-warm-700 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
							onkeydown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
						/>
						<button
							onclick={handleSubmit}
							disabled={!urlInput.trim()}
							class="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
						>
							Add
						</button>
					</div>
					{#if status === 'error'}
						<div class="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-600">
							{errorMessage}
						</div>
					{/if}

				{:else if status === 'loading'}
					<div class="flex flex-col items-center py-8">
						<svg class="h-8 w-8 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
						<p class="mt-3 text-sm font-medium text-warm-500">Looking up place details...</p>
					</div>

				{:else if status === 'success' && resultPlace}
					<div class="rounded-xl border border-sage-300 bg-sage-50 p-4">
						<div class="mb-2 flex items-center gap-2">
							<svg class="h-5 w-5 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22 4 12 14.01 9 11.01" />
							</svg>
							<span class="text-sm font-bold text-sage-800">Place added!</span>
						</div>
						<h3 class="text-base font-extrabold text-warm-800">{resultPlace.title}</h3>
						{#if resultPlace.address}
							<p class="mt-0.5 text-xs text-warm-500">{resultPlace.address}</p>
						{/if}
						<div class="mt-2 flex flex-wrap items-center gap-1.5">
							{#if resultPlace.category}
								<span class="rounded-full bg-warm-200 px-2 py-0.5 text-xs font-bold text-warm-600">{resultPlace.category}</span>
							{/if}
							{#if resultPlace.area}
								<span class="rounded-full bg-sage-200 px-2 py-0.5 text-xs font-bold text-sage-700">{resultPlace.area}</span>
							{/if}
							{#if resultPlace.rating}
								<span class="text-xs font-bold text-warm-700">{resultPlace.rating.toFixed(1)}<span class="text-brand-500">★</span></span>
							{/if}
						</div>
						{#if resultPlace.description}
							<p class="mt-2 line-clamp-2 text-xs text-warm-500">{resultPlace.description}</p>
						{/if}
					</div>

					{#if intelSuggestions && intelSuggestions.suggested_tags.length > 0}
						<div class="mt-3 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
							<div class="mb-2 flex items-center gap-1.5">
								<svg class="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 2L2 7l10 5 10-5-10-5z" />
									<path d="M2 17l10 5 10-5" />
									<path d="M2 12l10 5 10-5" />
								</svg>
								<span class="text-xs font-bold text-brand-700">Suggested Tags</span>
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each intelSuggestions.suggested_tags as tag}
									<span class="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">{tag}</span>
								{/each}
							</div>
							<div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-400">
								<span>{intelSuggestions.primary_category}</span>
								<span class="text-warm-200">·</span>
								<span>{intelSuggestions.market_niche}</span>
								{#if intelSuggestions.discussion_pillar}
									<span class="text-warm-200">·</span>
									<span>{intelSuggestions.discussion_pillar}</span>
								{/if}
							</div>
						</div>
					{/if}

					<div class="mt-4 flex items-center gap-3">
						<a
							href="/places"
							onclick={onClose}
							class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
						>
							View in library
						</a>
						<button
							onclick={reset}
							class="rounded-lg px-4 py-2 text-sm font-bold text-warm-500 hover:bg-warm-100 hover:text-warm-700"
						>
							Add another
						</button>
					</div>

				{:else if status === 'duplicate' && resultPlace}
					<div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
						<div class="mb-2 flex items-center gap-2">
							<svg class="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10" />
								<line x1="12" y1="8" x2="12" y2="12" />
								<line x1="12" y1="16" x2="12.01" y2="16" />
							</svg>
							<span class="text-sm font-bold text-amber-800">Already in your library</span>
						</div>
						<h3 class="text-base font-extrabold text-warm-800">{resultPlace.title}</h3>
						{#if resultPlace.address}
							<p class="mt-0.5 text-xs text-warm-500">{resultPlace.address}</p>
						{/if}
					</div>
					<div class="mt-4 flex items-center gap-3">
						<a
							href="/places"
							onclick={onClose}
							class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
						>
							View in library
						</a>
						<button
							onclick={reset}
							class="rounded-lg px-4 py-2 text-sm font-bold text-warm-500 hover:bg-warm-100 hover:text-warm-700"
						>
							Try another
						</button>
					</div>
				{/if}

			{:else}
				<!-- Upload Tab -->
				<div class="flex flex-col items-center py-6 text-center">
					<svg class="h-10 w-10 text-warm-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="17 8 12 3 7 8" />
						<line x1="12" y1="3" x2="12" y2="15" />
					</svg>
					<p class="mt-3 text-sm font-semibold text-warm-700">Bulk import from Google Takeout</p>
					<p class="mt-1 text-xs text-warm-400">Upload CSV files exported from your Google Maps saved places.</p>
					<a
						href="/upload"
						onclick={onClose}
						class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						Go to Upload page
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>
