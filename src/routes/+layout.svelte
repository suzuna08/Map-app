<script lang="ts">
	import '../app.css';
	import { invalidate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import AppBottomDock from '$lib/components/AppBottomDock.svelte';
	import { bottomDockSuppressed } from '$lib/stores/bottom-dock-suppressed';
	import { initDockScrollWatcher } from '$lib/stores/dock-scroll-state';

	let { data, children } = $props();

	let supabase = $derived(data.supabase);
	let session = $derived(data.session);

	let pathname = $derived(page.url.pathname);

	function appShellRoute(p: string): boolean {
		if (p === '/places' || p === '/collections' || p === '/upload' || p === '/settings') return true;
		if (p.startsWith('/collections/')) return true;
		if (p.startsWith('/settings/')) return true;
		return false;
	}

	let showDockBase = $derived(!!session && appShellRoute(pathname));
	let showDock = $derived(showDockBase && !$bottomDockSuppressed);

	$effect(() => {
		if (showDock) {
			const teardown = initDockScrollWatcher();
			return teardown;
		}
	});

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

</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
	<title>MyPlaces</title>
</svelte:head>

<div
	class="min-h-[100dvh] bg-sage-100 font-sans"
	style={showDock
		? '--app-dock-reserve: calc(5rem + env(safe-area-inset-bottom, 0px));'
		: '--app-dock-reserve: 0px;'}
>
	<div class="box-border min-h-[100dvh]">
		{@render children()}
	</div>

	{#if showDock}
		<AppBottomDock />
	{/if}
</div>
