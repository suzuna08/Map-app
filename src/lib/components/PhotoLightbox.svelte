<script lang="ts">
	interface Props {
		urls: string[];
		startIndex?: number;
		originRect?: DOMRect | null;
		onClose: () => void;
		onDelete?: (index: number) => void;
	}

	let { urls, startIndex = 0, originRect = null, onClose, onDelete }: Props = $props();

	let current = $state(0);
	$effect(() => { current = startIndex; });
	let touchStartX = 0;
	let touchDeltaX = $state(0);
	let swiping = $state(false);

	let animState = $state<'entering' | 'open' | 'exiting'>('entering');
	let imgStyle = $state('');
	let backdropOpacity = $state(0);

	$effect(() => {
		if (animState === 'entering') {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					backdropOpacity = 1;
					imgStyle = 'transform: translate(0,0) scale(1); opacity: 1;';
					setTimeout(() => { animState = 'open'; }, 160);
				});
			});
		}
	});

	function getEnterStyle(): string {
		if (originRect) {
			const cx = window.innerWidth / 2;
			const cy = window.innerHeight / 2;
			const ox = originRect.left + originRect.width / 2;
			const oy = originRect.top + originRect.height / 2;
			const dx = ox - cx;
			const dy = oy - cy;
			const sc = Math.min(originRect.width / window.innerWidth, originRect.height / window.innerHeight) * 1.2;
			return `transform: translate(${dx}px, ${dy}px) scale(${sc}); opacity: 0.5;`;
		}
		return 'transform: scale(0.85); opacity: 0;';
	}

	$effect(() => {
		imgStyle = getEnterStyle();
	});

	function closeWithAnimation() {
		animState = 'exiting';
		backdropOpacity = 0;
		imgStyle = getEnterStyle();
		setTimeout(() => { onClose(); }, 160);
	}

	function prev() { if (current > 0) current--; }
	function next() { if (current < urls.length - 1) current++; }

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeWithAnimation();
		if (e.key === 'ArrowLeft') prev();
		if (e.key === 'ArrowRight') next();
	}

	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		swiping = true;
		touchDeltaX = 0;
	}

	function onTouchMove(e: TouchEvent) {
		if (!swiping) return;
		touchDeltaX = e.touches[0].clientX - touchStartX;
	}

	function onTouchEnd() {
		if (!swiping) return;
		swiping = false;
		if (touchDeltaX > 60) prev();
		else if (touchDeltaX < -60) next();
		touchDeltaX = 0;
	}

	function handleAreaClick() {
		closeWithAnimation();
	}

	function stopProp(e: MouseEvent) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer"
	onclick={handleAreaClick}
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
>
	<!-- Backdrop -->
	<div
		class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-150"
		style="opacity: {backdropOpacity}"
	></div>

	<!-- Close button -->
	<button
		onclick={closeWithAnimation}
		class="absolute top-4 right-4 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/60 hover:text-white"
		aria-label="Close"
	>
		<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M18 6 6 18M6 6l12 12" />
		</svg>
	</button>

	<!-- Delete button -->
	{#if onDelete}
		<button
			onclick={(e) => { e.stopPropagation(); onDelete?.(current); }}
			class="absolute top-4 left-4 z-10 rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-danger-600 hover:text-white"
			aria-label="Delete photo"
		>
			<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			</svg>
		</button>
	{/if}

	<!-- Nav: left -->
	{#if current > 0}
		<button
			onclick={(e) => { e.stopPropagation(); prev(); }}
			class="absolute left-3 z-10 hidden rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/60 hover:text-white sm:block"
			aria-label="Previous"
		>
			<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6" />
			</svg>
		</button>
	{/if}

	<!-- Nav: right -->
	{#if current < urls.length - 1}
		<button
			onclick={(e) => { e.stopPropagation(); next(); }}
			class="absolute right-3 z-10 hidden rounded-full bg-black/40 p-2 text-white/80 transition-colors hover:bg-black/60 hover:text-white sm:block"
			aria-label="Next"
		>
			<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="9 18 15 12 9 6" />
			</svg>
		</button>
	{/if}

	<!-- Image with scale animation -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<img
		src={urls[current]}
		alt="Photo {current + 1} of {urls.length}"
		class="relative z-[1] max-h-[85vh] max-w-[90vw] cursor-pointer rounded-lg object-contain select-none sm:max-w-[80vw]"
		style="{animState === 'open' ? `transform: translateX(${swiping ? touchDeltaX * 0.4 : 0}px)` : imgStyle}; transition: transform 150ms ease-out, opacity 150ms ease-out;"
		draggable="false"
	/>

	<!-- Dots -->
	{#if urls.length > 1}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5" onclick={stopProp}>
			{#each urls as _, i}
				<button
					onclick={() => { current = i; }}
					class="h-2 w-2 rounded-full transition-all {i === current ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'}"
					aria-label="Go to photo {i + 1}"
				></button>
			{/each}
		</div>
	{/if}

	<!-- Counter -->
	<div class="absolute bottom-6 right-4 z-10 text-sm font-semibold text-white/60">
		{current + 1} / {urls.length}
	</div>
</div>
