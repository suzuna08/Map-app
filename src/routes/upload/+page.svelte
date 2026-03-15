<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseGoogleMapsCSV, type ParseResult } from '$lib/csv-parser';
	import type { PlaceInsert } from '$lib/types/database';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let files = $state<FileList | null>(null);
	let parseResults = $state<ParseResult[]>([]);
	let uploading = $state(false);
	let dragOver = $state(false);
	let uploadResult = $state<{ added: number; skipped: number; errors: string[] } | null>(null);

	$effect(() => {
		if (!session) goto('/login');
	});

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

		uploading = true;
		let addedCount = 0;
		let skippedCount = 0;
		const errors: string[] = [];

		const { data: existingPlaces } = await supabase
			.from('places')
			.select('url')
			.eq('user_id', session.user.id)
			.not('url', 'is', null);

		const existingUrls = new Set(
			(existingPlaces ?? []).map((p: { url: string | null }) => p.url).filter(Boolean)
		);

		for (const result of parseResults) {
			const newPlaces: PlaceInsert[] = [];

			for (const p of result.places) {
				const url = p.URL?.trim() || null;

				if (url && existingUrls.has(url)) {
					skippedCount++;
					continue;
				}

				newPlaces.push({
					user_id: session!.user.id,
					title: p.Title.trim(),
					note: p.Note || null,
					url,
					tags: p.Tags || null,
					comment: p.Comment || null,
					source_list: result.fileName
				});

				if (url) existingUrls.add(url);
			}

			if (newPlaces.length > 0) {
				const { error } = await supabase.from('places').insert(newPlaces);
				if (error) {
					errors.push(`${result.fileName}: ${error.message}`);
				} else {
					addedCount += newPlaces.length;
				}
			}
		}

		uploadResult = { added: addedCount, skipped: skippedCount, errors };
		uploading = false;
	}

	let totalPlaces = $derived(parseResults.reduce((sum, r) => sum + r.places.length, 0));
</script>

<div class="mx-auto max-w-2xl px-4 py-6 pb-[env(safe-area-inset-bottom)] sm:px-6">
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
							{#if uploadResult.errors.length > 0}
								{#each uploadResult.errors as err}
									<p class="mt-1 text-sm text-red-600">{err}</p>
								{/each}
							{/if}
						</div>
					</div>
					<div class="mt-4 flex items-center gap-3">
						<a
							href="/places"
							class="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
						>
							View your places
						</a>
						<button
							onclick={() => { parseResults = []; uploadResult = null; }}
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
