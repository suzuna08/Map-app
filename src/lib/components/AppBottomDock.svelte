<script lang="ts">
	import { page } from '$app/state';
	import { dockMode, type DockMode } from '$lib/stores/dock-scroll-state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let pathname = $derived(page.url.pathname);
	let mode = $state<DockMode>('active');

	$effect(() => {
		const unsub = dockMode.subscribe((m) => { mode = m; });
		return unsub;
	});

	const STORAGE_KEY = 'dock-position';
	const HINT_STORAGE_KEY = 'dock-hint-seen';
	const MOBILE_BREAKPOINT = 640;

	let pos = $state<{ x: number; y: number } | null>(null);
	let pillEl = $state<HTMLDivElement | null>(null);

	// Mobile collapse state
	let isMobile = $state(false);
	let mobileCollapsed = $state(false);
	let hintPlayed = $state(false);
	let hintAnimating = $state(false);
	let prefersReducedMotion = $state(false);

	onMount(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) pos = JSON.parse(raw);
		} catch { /* ignore */ }

		function checkMobile() {
			isMobile = window.innerWidth < MOBILE_BREAKPOINT;
		}
		checkMobile();
		window.addEventListener('resize', checkMobile);

		prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const hintSeen = localStorage.getItem(HINT_STORAGE_KEY);
		if (!hintSeen && !prefersReducedMotion) {
			const timer = setTimeout(() => {
				if (isMobile && !mobileCollapsed && !pos) {
					hintAnimating = true;
					setTimeout(() => {
						hintAnimating = false;
						hintPlayed = true;
						try { localStorage.setItem(HINT_STORAGE_KEY, '1'); } catch { /* ignore */ }
					}, 800);
				}
			}, 1200);
			return () => {
				clearTimeout(timer);
				window.removeEventListener('resize', checkMobile);
			};
		}

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	});

	function collapseMobile() {
		mobileCollapsed = true;
	}

	function expandMobile() {
		mobileCollapsed = false;
	}

	$effect(() => {
		if (!isMobile || mobileCollapsed) return;
		let skipNext = true;
		function onDocClick(e: MouseEvent) {
			if (skipNext) { skipNext = false; return; }
			if (pillEl && !pillEl.contains(e.target as Node)) {
				mobileCollapsed = true;
			}
		}
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick);
	});

	function clamp(x: number, y: number, w: number, h: number) {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 8;
		return {
			x: Math.max(margin, Math.min(x, vw - w - margin)),
			y: Math.max(margin, Math.min(y, vh - h - margin))
		};
	}

	function startDrag(e: PointerEvent) {
		if (!pillEl) return;
		e.preventDefault();
		const rect = pillEl.getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;
		const w = rect.width;
		const h = rect.height;

		function onMove(ev: PointerEvent) {
			pos = clamp(ev.clientX - offsetX, ev.clientY - offsetY, w, h);
		}

		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			if (pos) {
				try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
			}
		}

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		dockMode.set('active');
	}

	function resetPosition() {
		pos = null;
		try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
	}

	const dockTabBase =
		'flex min-h-[2.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-center text-[9px] font-bold leading-tight transition-colors sm:w-[5rem] sm:text-[10px]';
	const dockTabActive = 'bg-brand-100 text-brand-800';
	const dockTabIdle = 'text-warm-500 hover:bg-warm-100 hover:text-warm-700';
	const iconWrap = 'flex h-4 w-4 shrink-0 items-center justify-center sm:h-5 sm:w-5';

	let placesActive = $derived(pathname === '/places');
	let collectionsActive = $derived(pathname.startsWith('/collections'));
	let settingsActive = $derived(pathname === '/settings' || pathname.startsWith('/settings/'));

	let isPassive = $derived(mode === 'passive');
	let isCustomPos = $derived(pos !== null);

	// Track mobile dock slide-in state for JS-driven transitions
	let mobileSlideIn = $state(false);

	$effect(() => {
		if (showMobileCollapse && !mobileCollapsed) {
			// Trigger slide-in on next frame so the initial off-screen state renders first
			mobileSlideIn = false;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					mobileSlideIn = true;
				});
			});
		}
	});

	let showMobileCollapse = $derived(isMobile && !isCustomPos);
</script>

{#if isCustomPos}
	<!-- Desktop/custom-positioned dock — unchanged -->
	<nav
		class="fixed z-50"
		style="left:{pos!.x}px;top:{pos!.y}px;"
		aria-label="Main navigation"
	>
		<div
			bind:this={pillEl}
			class="dock-pill flex items-center gap-1 rounded-[1.25rem] border border-warm-200/80 bg-warm-50/95 px-1.5 py-1.5 shadow-lg shadow-warm-900/10 backdrop-blur-lg sm:gap-1.5 sm:px-2"
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-warm-300 hover:text-warm-500 active:cursor-grabbing"
				onpointerdown={startDrag}
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
					<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
					<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
				</svg>
			</div>

			{@render dockLinks()}

			<button
				onclick={resetPosition}
				class="flex h-8 w-5 shrink-0 items-center justify-center text-warm-300 transition-colors hover:text-warm-600"
				aria-label="Reset dock position"
				title="Reset to bottom"
			>
				<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
					<path d="M3 3v5h5" />
				</svg>
			</button>
		</div>
	</nav>
{:else if showMobileCollapse}
	<!-- Mobile: collapsible right-edge dock -->

	{#if mobileCollapsed}
		<!-- Collapsed: slim hint tab on right edge -->
		<button
			class="mobile-hint-tab fixed z-50 flex items-center justify-center rounded-l-xl border border-r-0 border-warm-200/80 bg-brand-50/95 shadow-md shadow-warm-900/10 backdrop-blur-lg"
			style="right: 0; top: 50%; transform: translateY(-50%); padding-right: env(safe-area-inset-right, 0px);"
			onclick={expandMobile}
			aria-label="Open navigation"
		>
			<div class="flex flex-col items-center gap-1.5 px-1.5 py-3">
				<svg class="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<polyline points="15 18 9 12 15 6" />
				</svg>
				<div class="flex h-5 w-5 items-center justify-center text-brand-600">
					<svg class="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
						<circle cx="12" cy="10" r="3" />
					</svg>
				</div>
			</div>
		</button>
	{:else}
		<!-- Expanded: full floating dock sliding from right -->
		<nav
			class="mobile-dock-expanded fixed right-0 z-50 flex items-center"
			class:mobile-hint-nudge={hintAnimating}
			style="top: 50%; transform: translateY(-50%) translateX({mobileSlideIn ? '0' : '100%'}); transition: transform 250ms ease-out; padding-right: env(safe-area-inset-right, 0px);"
			aria-label="Main navigation"
		>
			<div
				bind:this={pillEl}
				class="dock-pill flex flex-col items-center gap-1 rounded-l-[1.25rem] border border-r-0 border-warm-200/80 bg-warm-50/95 px-1.5 py-2 shadow-lg shadow-warm-900/10 backdrop-blur-lg"
			>
				<!-- Collapse button -->
				<button
					onclick={collapseMobile}
					class="flex h-6 w-6 shrink-0 items-center justify-center text-warm-300 transition-colors hover:text-warm-600"
					aria-label="Collapse navigation"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>

				{@render dockLinksMobileVertical()}
			</div>
		</nav>
	{/if}
{:else}
	<!-- Desktop: standard bottom dock — unchanged -->
	<nav
		class="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pt-2"
		class:dock-passive={isPassive}
		class:dock-active={!isPassive}
		style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
		aria-label="Main navigation"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={pillEl}
			class="dock-pill flex max-w-lg items-center gap-1 rounded-[1.25rem] border border-warm-200/80 bg-warm-50/95 px-1.5 py-1.5 shadow-lg shadow-warm-900/10 backdrop-blur-lg sm:gap-1.5 sm:px-2"
			onpointerenter={() => dockMode.set('active')}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-warm-300 hover:text-warm-500 active:cursor-grabbing"
				onpointerdown={startDrag}
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
					<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
					<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
					<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
				</svg>
			</div>

			{@render dockLinks()}
		</div>
	</nav>
{/if}

{#snippet dockLinks()}
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
{/snippet}

{#snippet dockLinksMobileVertical()}
	<a
		href="/places"
		class="mobile-dock-link {placesActive ? 'mobile-dock-link-active' : 'mobile-dock-link-idle'}"
		aria-current={placesActive ? 'page' : undefined}
	>
		<span class="flex h-5 w-5 items-center justify-center" aria-hidden="true">
			<svg class="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
				<circle cx="12" cy="10" r="3" />
			</svg>
		</span>
		<span class="text-[8px] font-bold leading-tight">Places</span>
	</a>

	<a
		href="/collections"
		class="mobile-dock-link {collectionsActive ? 'mobile-dock-link-active' : 'mobile-dock-link-idle'}"
		aria-current={collectionsActive ? 'page' : undefined}
	>
		<span class="flex h-5 w-5 items-center justify-center" aria-hidden="true">
			<svg class="h-full w-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="7" height="7" rx="1" />
				<rect x="14" y="3" width="7" height="7" rx="1" />
				<rect x="3" y="14" width="7" height="7" rx="1" />
				<rect x="14" y="14" width="7" height="7" rx="1" />
			</svg>
		</span>
		<span class="text-[8px] font-bold leading-tight">Collections</span>
	</a>

	<a
		href="/settings"
		class="mobile-dock-link {settingsActive ? 'mobile-dock-link-active' : 'mobile-dock-link-idle'}"
		aria-current={settingsActive ? 'page' : undefined}
	>
		<span class="flex h-5 w-5 items-center justify-center" aria-hidden="true">
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
		<span class="text-[8px] font-bold leading-tight">Settings</span>
	</a>
{/snippet}

<style>
	/* ---- Shared ---- */
	nav:not(.mobile-dock-expanded) {
		pointer-events: none;
	}

	.dock-pill {
		pointer-events: auto;
	}

	/* ---- Desktop dock states ---- */
	.dock-active {
		opacity: 1;
		transform: translateY(0);
		transition: opacity 280ms ease, transform 280ms ease;
	}

	.dock-passive {
		opacity: 0.45;
		transform: translateY(10px);
		transition: opacity 280ms ease, transform 280ms ease;
	}

	.dock-passive .dock-pill {
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
	}

	nav:not(.mobile-dock-expanded):hover,
	nav:not(.mobile-dock-expanded):focus-within {
		opacity: 1 !important;
		transform: translateY(0) !important;
	}

	/* ---- Mobile dock ---- */
	.mobile-dock-expanded {
		pointer-events: auto;
	}

	.mobile-hint-tab {
		animation: mobile-hint-appear 200ms ease-out both;
	}

	.mobile-dock-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		width: 3.5rem;
		min-height: 2.75rem;
		padding: 0.375rem 0.25rem;
		border-radius: 0.5rem;
		text-align: center;
		transition: background-color 150ms ease, color 150ms ease;
	}

	.mobile-dock-link-active {
		background-color: var(--color-brand-100);
		color: var(--color-brand-800);
	}

	.mobile-dock-link-idle {
		color: var(--color-warm-500);
	}

	.mobile-dock-link-idle:active {
		background-color: var(--color-warm-100);
		color: var(--color-warm-700);
	}

	/* First-load nudge hint */
	.mobile-hint-nudge {
		animation: mobile-nudge-hint 800ms ease-in-out both;
	}

	@keyframes mobile-nudge-hint {
		0% { transform: translateY(-50%) translateX(0); }
		35% { transform: translateY(-50%) translateX(10px); }
		100% { transform: translateY(-50%) translateX(0); }
	}

	@keyframes mobile-hint-appear {
		from {
			opacity: 0;
			transform: translateY(-50%) translateX(8px);
		}
		to {
			opacity: 1;
			transform: translateY(-50%) translateX(0);
		}
	}

	/* Respect reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.mobile-dock-expanded {
			transition: none !important;
		}
		.mobile-hint-tab,
		.mobile-hint-nudge {
			animation: none;
		}
	}
</style>
