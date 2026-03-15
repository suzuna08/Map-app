<script lang="ts">
	let { data } = $props();
	let session = $derived(data.session);
</script>

<div class="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
	<div class="mb-6 rounded-2xl bg-brand-100 p-5">
		<svg class="h-14 w-14 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
			<circle cx="12" cy="10" r="3" />
		</svg>
	</div>

	<h1 class="mb-3 text-4xl font-bold tracking-tight text-warm-800">
		Your places, organized
	</h1>
	<p class="mb-8 max-w-md text-lg leading-relaxed text-warm-500">
		Import saved places from Google Maps, tag them freely, and find exactly what you need. No folders. No clutter.
	</p>

	{#if session}
		<div class="flex gap-3">
			<a
				href="/places"
				class="rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
			>
				Open My Places
			</a>
			<a
				href="/upload"
				class="rounded-xl border border-warm-300 bg-warm-50 px-6 py-3 text-sm font-bold text-warm-700 shadow-sm transition-all hover:bg-warm-100"
			>
				Upload CSV
			</a>
		</div>
	{:else}
		<div class="flex gap-3">
			<a
				href="/login"
				class="rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md"
			>
				Get Started
			</a>
			<a
				href="/login"
				class="rounded-xl border border-warm-300 bg-warm-50 px-6 py-3 text-sm font-bold text-warm-700 shadow-sm transition-all hover:bg-warm-100"
			>
				Sign In
			</a>
		</div>
	{/if}

	<div class="mt-16 grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-3">
		<div class="rounded-xl border border-warm-200 bg-warm-50 p-5 text-left">
			<div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sage-200 text-sage-700">
				<svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
			</div>
			<h3 class="mb-1 text-sm font-bold text-warm-800">Import</h3>
			<p class="text-xs leading-relaxed text-warm-500">Upload CSV files from Google Takeout with one drag.</p>
		</div>

		<div class="rounded-xl border border-warm-200 bg-warm-50 p-5 text-left">
			<div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
				<svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
					<line x1="7" y1="7" x2="7.01" y2="7" />
				</svg>
			</div>
			<h3 class="mb-1 text-sm font-bold text-warm-800">Tag</h3>
			<p class="text-xs leading-relaxed text-warm-500">Add flexible tags to organize places your way, like Notion.</p>
		</div>

		<div class="rounded-xl border border-warm-200 bg-warm-50 p-5 text-left">
			<div class="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sage-200 text-sage-700">
				<svg class="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			</div>
			<h3 class="mb-1 text-sm font-bold text-warm-800">Find</h3>
			<p class="text-xs leading-relaxed text-warm-500">Search across names, tags, areas, and descriptions instantly.</p>
		</div>
	</div>
</div>
