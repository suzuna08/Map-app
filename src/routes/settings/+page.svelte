<script lang="ts">
	import { goto } from '$app/navigation';
	import { t, getLocale, setLocale, LOCALE_LABELS, type Locale } from '$lib/i18n/locale.svelte';

	let { data } = $props();
	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let currentLocale = $derived(getLocale());

	function handleLocaleChange(l: Locale) {
		setLocale(l);
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<svelte:head>
	<title>{t('settings.title')} — MyPlaces</title>
</svelte:head>

<div
	class="mx-auto max-w-lg px-4 py-8 pb-[max(5rem,calc(var(--app-dock-reserve,0px)+1.5rem))] sm:px-6 sm:py-10"
>
	<h1 class="text-2xl font-extrabold text-warm-800">{t('settings.title')}</h1>

	<section class="mt-8 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
		<h2 class="text-sm font-extrabold uppercase tracking-wide text-warm-500">{t('settings.account')}</h2>
		{#if session?.user?.email}
			<p class="mt-3 text-sm font-medium text-warm-700">{session.user.email}</p>
		{:else}
			<p class="mt-3 text-sm text-warm-500">{t('settings.signedIn')}</p>
		{/if}
		<button
			type="button"
			onclick={handleSignOut}
			class="mt-5 w-full rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm font-bold text-warm-700 transition-colors hover:bg-warm-100"
		>
			{t('settings.signOut')}
		</button>
	</section>

	<section class="mt-4 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
		<h2 class="text-sm font-extrabold uppercase tracking-wide text-warm-500">{t('settings.language')}</h2>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each Object.entries(LOCALE_LABELS) as [key, label]}
				<button
					type="button"
					onclick={() => handleLocaleChange(key as Locale)}
					class="rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors {currentLocale === key
						? 'border-brand-500 bg-brand-50 text-brand-700'
						: 'border-warm-200 bg-warm-50 text-warm-600 hover:border-warm-300 hover:bg-warm-100'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<section class="mt-4 rounded-2xl border border-warm-200 bg-white p-5 shadow-sm">
		<h2 class="text-sm font-extrabold uppercase tracking-wide text-warm-500">{t('settings.data')}</h2>
		<p class="mt-3 text-sm text-warm-500">{t('settings.dataDescription')}</p>
		<a
			href="/upload"
			class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-100"
		>
			<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			{t('settings.importCsv')}
		</a>
	</section>
</div>
