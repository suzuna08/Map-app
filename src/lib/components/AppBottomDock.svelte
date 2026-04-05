<script lang="ts">
	import { page } from '$app/state';
	import { dockMode, type DockMode } from '$lib/stores/dock-scroll-state';

	let pathname = $derived(page.url.pathname);
	let mode = $state<DockMode>('active');

	$effect(() => {
		const unsub = dockMode.subscribe((m) => { mode = m; });
		return unsub;
	});

	const dockTabBase =
		'flex min-h-[3.25rem] w-[5.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-center text-[10px] font-bold leading-tight transition-colors sm:w-[6rem] sm:text-xs';
	const dockTabActive = 'bg-brand-100 text-brand-800';
	const dockTabIdle = 'text-warm-500 hover:bg-warm-100 hover:text-warm-700';
	const iconWrap = 'flex h-5 w-5 shrink-0 items-center justify-center sm:h-6 sm:w-6';

	let placesActive = $derived(pathname === '/places');
	let collectionsActive = $derived(pathname.startsWith('/collections'));
	let settingsActive = $derived(pathname === '/settings' || pathname.startsWith('/settings/'));

	let isPassive = $derived(mode === 'passive');

	function handleInteraction() {
		dockMode.set('active');
	}
</script>

<nav
	class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
	class:dock-passive={isPassive}
	class:dock-active={!isPassive}
	aria-label="Main navigation"
	onpointerenter={handleInteraction}
>
	<div
		class="dock-pill pointer-events-auto flex max-w-lg items-center gap-1 rounded-[1.75rem] border border-warm-200/80 bg-warm-50/95 px-2 py-2 shadow-lg shadow-warm-900/10 backdrop-blur-lg sm:gap-2 sm:px-3"
	>
		<a
			href="/places"
			class="{dockTabBase} {placesActive ? dockTabActive : dockTabIdle}"
			aria-current={placesActive ? 'page' : undefined}
		>
			<span class={iconWrap} aria-hidden="true">
				<svg class="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
					<circle cx="12" cy="10" r="3" />
				</svg>
			</span>
			<span class="max-w-full text-center leading-tight">Places</span>
		</a>

		<a
			href="/collections"
			class="{dockTabBase} {collectionsActive ? dockTabActive : dockTabIdle}"
			aria-current={collectionsActive ? 'page' : undefined}
		>
			<span class={iconWrap} aria-hidden="true">
				<svg class="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
			</span>
			<span class="max-w-full text-center leading-tight">Collections</span>
		</a>

		<a
			href="/settings"
			class="{dockTabBase} {settingsActive ? dockTabActive : dockTabIdle}"
			aria-current={settingsActive ? 'page' : undefined}
		>
			<span class={iconWrap} aria-hidden="true">
				<svg
					class="h-full w-full"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
					<path
						d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
					/>
				</svg>
			</span>
			<span class="max-w-full text-center leading-tight">Settings</span>
		</a>
	</div>
</nav>

<style>
	nav {
		transition: opacity 280ms ease, transform 280ms ease;
		will-change: opacity, transform;
	}

	.dock-active {
		opacity: 1;
		transform: translateY(0);
	}

	.dock-passive {
		opacity: 0.45;
		transform: translateY(10px);
	}

	.dock-passive .dock-pill {
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
	}

	nav:hover,
	nav:focus-within {
		opacity: 1 !important;
		transform: translateY(0) !important;
	}
</style>
