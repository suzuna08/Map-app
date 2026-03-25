<script lang="ts">
	import '../app.css';
	import { invalidate, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import AddPlaceModal from '$lib/components/AddPlaceModal.svelte';

	let { data, children } = $props();

	let supabase = $derived(data.supabase);
	let session = $derived(data.session);
	let showAddModal = $state(false);

	const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

	function scheduleTokenRefresh(expiresAt: number | undefined) {
		if (!expiresAt) return undefined;
		const msUntilExpiry = expiresAt * 1000 - Date.now();
		const delay = Math.max(msUntilExpiry - REFRESH_MARGIN_MS, 0);
		return setTimeout(async () => {
			const { error } = await supabase.auth.refreshSession();
			if (error) {
				// Refresh failed — session may have been revoked server-side
				goto('/login');
			}
		}, delay);
	}

	onMount(() => {
		let refreshTimer = scheduleTokenRefresh(session?.expires_at);

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event, newSession) => {
			if (event === 'SIGNED_OUT') {
				clearTimeout(refreshTimer);
				invalidate('supabase:auth');
				return;
			}

			if (newSession?.expires_at !== session?.expires_at) {
				clearTimeout(refreshTimer);
				refreshTimer = scheduleTokenRefresh(newSession?.expires_at);
				invalidate('supabase:auth');
			}
		});

		function handleVisibilityChange() {
			if (document.visibilityState !== 'visible') return;

			supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
				if (!currentSession) {
					invalidate('supabase:auth');
					return;
				}

				const expiresAt = currentSession.expires_at ?? 0;
				const isNearExpiry = expiresAt * 1000 - Date.now() < REFRESH_MARGIN_MS;
				if (isNearExpiry) {
					supabase.auth.refreshSession();
				}
			});
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			clearTimeout(refreshTimer);
			subscription.unsubscribe();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
	<title>MapOrganizer</title>
</svelte:head>

<div class="min-h-[100dvh] bg-sage-100 font-sans">
	<nav class="sticky top-0 z-30 border-b border-warm-200/60 bg-warm-50/85 backdrop-blur-lg">
		<div class="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-3 sm:h-14 sm:px-6">
			<a href={session ? '/places' : '/'} class="flex items-center gap-1.5 text-base font-extrabold text-warm-800 sm:gap-2 sm:text-lg">
				<svg class="h-5 w-5 text-brand-600 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
				MapOrganizer
			</a>

		{#if session}
			<div class="flex items-center gap-1 sm:gap-3">
				<a
					href="/places"
					class="rounded-lg px-1.5 py-1 text-[11px] font-bold text-warm-600 transition-colors hover:bg-warm-100 hover:text-warm-800 sm:px-3 sm:py-1.5 sm:text-sm"
				>
					Places
				</a>
				<a
					href="/collections"
					class="rounded-lg px-1.5 py-1 text-[11px] font-bold text-warm-600 transition-colors hover:bg-warm-100 hover:text-warm-800 sm:px-3 sm:py-1.5 sm:text-sm"
				>
					Collections
				</a>
				<button
					onclick={() => { showAddModal = true; }}
					class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-sm"
				>
					<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					<span class="hidden sm:inline">Add Place</span>
				</button>
				<button
					onclick={handleSignOut}
					class="rounded-lg px-1.5 py-1 text-[11px] font-medium text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600 sm:px-3 sm:py-1.5 sm:text-sm"
				>
					Sign out
				</button>
			</div>
		{/if}
		</div>
	</nav>

	{@render children()}

	{#if showAddModal}
		<AddPlaceModal
			onClose={() => { showAddModal = false; }}
			onPlaceAdded={() => { invalidate('supabase:auth'); window.dispatchEvent(new CustomEvent('place-added')); }}
		/>
	{/if}
</div>
