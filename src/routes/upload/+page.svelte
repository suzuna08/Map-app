<script lang="ts">
	import { parseGoogleMapsCSV, type ParseResult } from '$lib/csv-parser';
	import type { PlaceInsert } from '$lib/types/database';
	import { colorForTag } from '$lib/tag-colors';
	import { getNextOrderIndex } from '$lib/tag-order';
	import { normalizeTagName, toDisplayName } from '$lib/tag-utils';
	import { applyTagToPlaces } from '$lib/stores/places.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let files = $state<FileList | null>(null);
	let parseResults = $state<ParseResult[]>([]);
	let uploading = $state(false);
	let dragOver = $state(false);
	let uploadResult = $state<{ added: number; skipped: number; tagged: number; errors: string[]; tagsCreated: string[] } | null>(null);
	let enrichProgress = $state<{ enriched: number; total: number; done: boolean } | null>(null);

	async function handleFiles(fileList: FileList) {
		const csvFiles = Array.from(fileList).filter((f) => f.name.endsWith('.csv'));
		if (csvFiles.length === 0) return;

		const results = await Promise.all(csvFiles.map(parseGoogleMapsCSV));
		parseResults = results;
		uploadResult = null;
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) handleFiles(input.files);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
	}

	async function uploadToSupabase() {
		if (!session?.user?.id || parseResults.length === 0) return;

		const userId = session.user.id;
		uploading = true;
		let addedCount = 0;
		let skippedCount = 0;
		let taggedCount = 0;
		const errors: string[] = [];
		const tagsCreated: string[] = [];

		const [{ data: existingPlaces }, { data: existingTags }] = await Promise.all([
			supabase
				.from('places')
				.select('id, url')
				.eq('user_id', userId)
				.not('url', 'is', null),
			supabase
				.from('tags')
				.select('id, name')
				.eq('user_id', userId)
		]);

		const existingUrlToId = new Map(
			(existingPlaces ?? []).map((p: { id: string; url: string | null }) => [p.url, p.id])
		);

		const tagsByNormalized = new Map(
			(existingTags ?? []).map((t: { id: string; name: string }) => [normalizeTagName(t.name), t])
		);

		for (const result of parseResults) {
			const newPlaces: PlaceInsert[] = [];
			const skippedPlaceIds: string[] = [];

			for (const p of result.places) {
				const url = p.URL?.trim() || null;

				if (url && existingUrlToId.has(url)) {
					skippedPlaceIds.push(existingUrlToId.get(url)!);
					skippedCount++;
					continue;
				}

				newPlaces.push({
					user_id: userId,
					title: p.Title.trim(),
					note: p.Note || null,
					url,
					tags: p.Tags || null,
					comment: p.Comment || null,
					source_list: result.fileName
				});

				if (url) existingUrlToId.set(url, '');
			}

			let insertedPlaceIds: string[] = [];

			if (newPlaces.length > 0) {
				const { data: inserted, error } = await supabase
					.from('places')
					.insert(newPlaces)
					.select('id');

				if (error) {
					errors.push(`${result.fileName}: ${error.message}`);
				} else if (inserted) {
					addedCount += inserted.length;
					insertedPlaceIds = inserted.map((p: { id: string }) => p.id);
				}
			}

			const allPlaceIds = [...insertedPlaceIds, ...skippedPlaceIds];
			if (allPlaceIds.length === 0) continue;

			const displayName = toDisplayName(result.fileName);
			if (!displayName) continue;

			const normalized = normalizeTagName(displayName);
			let tag = tagsByNormalized.get(normalized);

			if (!tag) {
				const orderIndex = await getNextOrderIndex(supabase, userId);
				const insertData: Record<string, unknown> = {
					user_id: userId,
					name: displayName,
					color: colorForTag(displayName),
					source: 'user',
					order_index: orderIndex
				};
				const { data: newTag } = await supabase
					.from('tags')
					.insert(insertData as any)
					.select('id, name')
					.single();

				if (newTag) {
					tag = newTag;
					tagsByNormalized.set(normalized, newTag);
					tagsCreated.push(displayName);
				}
			}

			if (tag) {
				await applyTagToPlaces(supabase, tag.id, allPlaceIds);
				taggedCount += allPlaceIds.length;
			}
		}

		uploadResult = { added: addedCount, skipped: skippedCount, tagged: taggedCount, errors, tagsCreated };
		uploading = false;

		if (addedCount > 0) {
			await enrichAllUnenriched();
		}
	}

	async function enrichAllUnenriched() {
		const { count } = await supabase
			.from('places')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', session!.user.id)
			.is('enriched_at', null)
			.not('url', 'is', null);

		const total = count ?? 0;
		if (total === 0) return;

		enrichProgress = { enriched: 0, total, done: false };

		let enrichedSoFar = 0;
		while (true) {
			const res = await fetch('/api/places/enrich-all', { method: 'POST' });
			if (!res.ok) break;
			const result = await res.json();
			enrichedSoFar += result.enriched;
			enrichProgress = { enriched: enrichedSoFar, total, done: false };
			if (result.enriched === 0 || result.enriched < result.total) break;
		}
		enrichProgress = { enriched: enrichedSoFar, total, done: true };
	}

	let totalPlaces = $derived(parseResults.reduce((sum, r) => sum + r.places.length, 0));
</script>

<div
	class="mx-auto max-w-2xl px-4 py-6 sm:px-6 pb-[max(3rem,calc(var(--app-dock-reserve,0px)+env(safe-area-inset-bottom,0px)+1.5rem))]"
>
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-warm-800">Upload Google Maps Places</h1>
		<p class="mt-1 text-sm text-warm-500">
			Import CSV files exported from Google Takeout. Go to
			<a href="https://takeout.google.com" target="_blank" class="font-semibold text-brand-600 underline">takeout.google.com</a>,
			select "Saved" data, and download your saved places.
		</p>
	</div>

	<!-- Drop zone -->
	<div
		role="button"
		tabindex="0"
		class="relative rounded-2xl border-2 border-dashed p-10 text-center transition-colors {dragOver
			? 'border-brand-400 bg-brand-50'
			: 'border-warm-300 bg-warm-50 hover:border-brand-400'}"
		ondragover={(e) => { e.preventDefault(); dragOver = true; }}
		ondragleave={() => { dragOver = false; }}
		ondrop={handleDrop}
	>
		<svg
			class="mx-auto h-12 w-12 text-warm-400"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" y1="3" x2="12" y2="15" />
		</svg>
		<p class="mt-3 text-sm font-semibold text-warm-700">Drag & drop CSV files here</p>
		<p class="mt-1 text-xs text-warm-500">or click to browse</p>
		<input
			type="file"
			accept=".csv"
			multiple
			class="absolute inset-0 cursor-pointer opacity-0"
			onchange={handleFileInput}
		/>
	</div>

	<!-- Parse results -->
	{#if parseResults.length > 0}
		<div class="mt-6 space-y-4">
			{#each parseResults as result}
				<div class="rounded-2xl border border-warm-200 bg-warm-50 p-5">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="font-bold text-warm-800">{result.fileName}</h3>
							<p class="text-sm text-warm-500">{result.places.length} places found</p>
						</div>
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-sage-200">
							<svg class="h-5 w-5 text-sage-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</div>
					</div>

					{#if result.places.length > 0}
						<div class="mt-3 max-h-48 overflow-y-auto">
							<div class="space-y-1">
								{#each result.places as place, i}
									<div class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-warm-700 odd:bg-warm-100/50">
										<span class="text-xs text-warm-400">{i + 1}</span>
										<span class="font-medium">{place.Title}</span>
										{#if place.URL}
											<a
												href={place.URL}
												target="_blank"
												aria-label="Open in Google Maps"
												class="ml-auto text-brand-500 hover:text-brand-600"
											>
												<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
													<polyline points="15 3 21 3 21 9" />
													<line x1="10" y1="14" x2="21" y2="3" />
												</svg>
											</a>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if result.errors.length > 0}
						<div class="mt-3 rounded-lg bg-amber-50 p-3">
							<p class="text-xs font-medium text-amber-700">Parse warnings:</p>
							{#each result.errors as err}
								<p class="text-xs text-amber-600">{err}</p>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<!-- Upload button -->
			{#if !uploadResult}
				<button
					onclick={uploadToSupabase}
					disabled={uploading || totalPlaces === 0}
					class="w-full rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md disabled:opacity-50"
				>
					{#if uploading}
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
							Importing...
						</span>
					{:else}
						Import {totalPlaces} places to your library
					{/if}
				</button>
			{/if}

			<!-- Upload result -->
			{#if uploadResult}
				<div class="rounded-2xl border border-sage-300 bg-sage-100 p-5">
					<div class="flex items-start gap-3">
						<svg class="mt-0.5 h-6 w-6 shrink-0 text-sage-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
							<polyline points="22 4 12 14.01 9 11.01" />
						</svg>
						<div>
							{#if uploadResult.added > 0}
								<p class="font-bold text-sage-800">
									{uploadResult.added} new {uploadResult.added === 1 ? 'place' : 'places'} added!
								</p>
							{:else}
								<p class="font-bold text-sage-800">All places already in your library.</p>
							{/if}
							{#if uploadResult.skipped > 0}
								<p class="mt-0.5 text-sm font-medium text-warm-500">
									{uploadResult.skipped} {uploadResult.skipped === 1 ? 'place' : 'places'} already existed (skipped)
								</p>
							{/if}
							{#if uploadResult.tagsCreated.length > 0}
								<p class="mt-1 text-sm font-medium text-brand-600">
									{uploadResult.tagsCreated.length === 1 ? 'Tag' : 'Tags'} created: {uploadResult.tagsCreated.join(', ')}
								</p>
							{/if}
							{#if uploadResult.tagged > 0}
								<p class="mt-0.5 text-sm font-medium text-warm-500">
									{uploadResult.tagged} {uploadResult.tagged === 1 ? 'place' : 'places'} auto-tagged from file names
								</p>
							{/if}
							{#if uploadResult.errors.length > 0}
								{#each uploadResult.errors as err}
									<p class="mt-1 text-sm text-red-600">{err}</p>
								{/each}
							{/if}
						</div>
					</div>
					{#if enrichProgress}
						<div class="mt-3 rounded-lg border border-warm-200 bg-warm-50 px-4 py-3">
							{#if enrichProgress.done}
								<div class="flex items-center gap-2">
									<svg class="h-4 w-4 shrink-0 text-sage-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
										<polyline points="22 4 12 14.01 9 11.01" />
									</svg>
									<p class="text-sm font-medium text-sage-700">
										Fetched details for {enrichProgress.enriched} of {enrichProgress.total} places
									</p>
								</div>
							{:else}
								<div class="flex items-center gap-2">
									<svg class="h-4 w-4 shrink-0 animate-spin text-brand-500" viewBox="0 0 24 24" fill="none">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
									</svg>
									<p class="text-sm font-medium text-warm-600">
										Fetching details... {enrichProgress.enriched} / {enrichProgress.total}
									</p>
								</div>
								<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-warm-200">
									<div
										class="h-full rounded-full bg-brand-500 transition-all duration-300"
										style="width: {Math.round((enrichProgress.enriched / enrichProgress.total) * 100)}%"
									></div>
								</div>
							{/if}
						</div>
					{/if}
					<div class="mt-4 flex items-center gap-3">
						<a
							href="/places"
							class="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
						>
							View your places
						</a>
						<button
							onclick={() => { parseResults = []; uploadResult = null; enrichProgress = null; }}
							class="rounded-lg px-4 py-2 text-sm font-bold text-warm-500 hover:bg-warm-200 hover:text-warm-700"
						>
							Upload more
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
