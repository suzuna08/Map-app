<script lang="ts">
	/** Ringed cream circle + full-color emoji, or same footprint with centered accent dot when no emoji. */
	type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

	let {
		color = '#A5834F',
		emoji = null,
		size = 'md',
		class: className = '',
		decorative = true
	}: {
		color?: string | null;
		emoji?: string | null;
		size?: Size;
		class?: string;
		decorative?: boolean;
	} = $props();

	const accent = $derived(color ?? '#A5834F');

	const cfg = $derived.by(() => {
		switch (size) {
			case 'xs':
				return { outer: 'h-7 w-7', emoji: 'text-[0.95rem] leading-none', dot: 'h-2.5 w-2.5', ring: 1.5 };
			case 'sm':
				return { outer: 'h-9 w-9', emoji: 'text-[1.2rem] leading-none', dot: 'h-3 w-3', ring: 2 };
			case 'md':
				return { outer: 'h-10 w-10', emoji: 'text-[1.35rem] leading-none', dot: 'h-3.5 w-3.5', ring: 2 };
			case 'lg':
				return {
					outer: 'h-8 w-8 sm:h-9 sm:w-9',
					emoji: 'text-base leading-none sm:text-[1.15rem]',
					dot: 'h-3 w-3 sm:h-3.5 sm:w-3.5',
					ring: 2.5
				};
			case 'xl':
				return {
					outer: 'h-11 w-11 sm:h-14 sm:w-14',
					emoji: 'text-xl leading-none sm:text-[1.65rem]',
					dot: 'h-4 w-4 sm:h-5 sm:w-5',
					ring: 3
				};
			default:
				return { outer: 'h-10 w-10', emoji: 'text-[1.35rem] leading-none', dot: 'h-3.5 w-3.5', ring: 2 };
		}
	});
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-full bg-[#faf7f2] {cfg.outer} {className}"
	style="box-shadow: inset 0 0 0 {cfg.ring}px {accent};"
>
	{#if emoji}
		<span class="select-none {cfg.emoji}" aria-hidden={decorative}>{emoji}</span>
	{:else}
		<span class="block shrink-0 rounded-full {cfg.dot}" style="background-color: {accent};" aria-hidden="true"></span>
	{/if}
</div>
