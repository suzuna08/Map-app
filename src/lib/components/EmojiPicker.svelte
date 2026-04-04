<script lang="ts">
	type EmojiCategory = { name: string; icon: string; emojis: string[] };

	let { selected = null, onSelect }: { selected: string | null; onSelect: (emoji: string | null) => void } = $props();

	let search = $state('');
	let activeCategory = $state(0);
	let gridEl = $state<HTMLDivElement | null>(null);

	const categories: EmojiCategory[] = [
		{
			name: 'Food & Drink',
			icon: '🍣',
			emojis: [
				'🍜','🍣','🍱','🍛','🍲','🍝','🍕','🍔','🌮','🌯','🥙','🥗','🍰','🎂','🧁','🍩',
				'🍪','🍫','🍬','🍭','🍮','🍡','🍧','🍨','🍦','🥧','🥮','🥐','🥖','🥨','🥯','🥞',
				'🧇','🥚','🍳','🥓','🥩','🍗','🍖','🌭','🥪','🥘','🫕','🥫','🍿','🧈','🧀','🥜',
				'🌰','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍶','🍵','☕','🧃','🥤','🫖','🧋',
				'🍼','🥛','🍯','🫒','🫑','🥑','🥦','🥬','🥒','🫛','🫘','🌽','🥕','🧄','🧅','🥔',
				'🍠','🫚','🥝','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒',
				'🍓','🫐','🥥',
			],
		},
		{
			name: 'Travel & Places',
			icon: '✈️',
			emojis: [
				'🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒',
				'🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🏕','🌁','🌃','🌆','🌇','🌉',
				'🌄','🌅','🎠','🎡','🎢','🎪','🗾','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏖️','🏜️','🏝️',
				'✈️','🛫','🛬','🚀','🛸','🚁','🛶','⛵','🚤','🛳️','⛴️','🚢','🚂','🚃','🚄','🚅',
				'🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚕',
				'🚖','🚗','🚘','🚙','🛻','🚚','🚛','🏎️','🛵','🏍️','🛺','🚲','🛴','🛹','🛼',
			],
		},
		{
			name: 'Activities',
			icon: '🎾',
			emojis: [
				'⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏑',
				'🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️',
				'🏂','🪂','🏋️','🤼','🤸','🤺','⛹️','🤾','🏌️','🧗','🧘','🎯','🎳','🎮','🕹️','🎲',
				'🧩','♟️','🎰','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎹','🥁','🪘','🎷','🎺',
				'🎸','🪕','🎻','🪗','🎪',
			],
		},
		{
			name: 'Nature',
			icon: '🌸',
			emojis: [
				'🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🪴','🌲','🌳','🌴','🌵','🌾',
				'🌿','☘️','🍀','🍁','🍂','🍃','🪹','🪺','🍄','🌰','🐚','🪸','🪨','🌊','🌬️','🌀',
				'🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','⚡','❄️','☃️','⛄','🌨️','💧',
				'💦','🌙','🌛','🌜','🌝','🌞','⭐','🌟','💫','✨','☄️','🔥','🐶','🐱','🐭','🐹',
				'🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤',
				'🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲',
				'🦗','🪳','🐢','🐍','🦎','🦂','🦀','🦞','🦐','🦑','🐙','🐠','🐟','🐡','🐬','🦈',
				'🐳','🐋','🐊','🐆','🐅','🐃','🦬','🐂','🐄','🫏','🐪','🐫','🦙','🦒','🐘','🦣',
				'🦏','🦛','🐁','🐀','🐇','🐿️','🦫','🦔','🦦','🦥','🐉','🦕','🦖',
			],
		},
		{
			name: 'Objects',
			icon: '💡',
			emojis: [
				'💡','🔦','🕯️','📷','📸','🔍','🔎','📱','💻','⌨️','🖥️','🖨️','📠','📺','📻','🎙️',
				'📡','🔑','🗝️','🔒','🔓','📦','📫','📬','📭','📮','🗳️','✏️','✒️','🖋️','🖊️','🖌️',
				'🖍️','📝','📁','📂','📅','📆','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏',
				'📐','✂️','🗃️','🗄️','🗑️','💰','💴','💵','💶','💷','💳','💎','⚖️','🪜','🧰','🪛',
				'🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧲','🛡️','🔫','🪃','🏹','⚔️','🗡️',
				'💣','🪓','🔪','🗺️','🧭','🎒','🧳','👜','👝','👛','💼','🎓','🧢','👑','💍','💄',
				'👓','🕶️','🥽','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👔','👕','👖',
				'🩴','👞','👟','🥿','👠','👡','🩰','👢','👒','🎩','🪖',
			],
		},
		{
			name: 'Smileys',
			icon: '😊',
			emojis: [
				'😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
				'😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡',
				'🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','🫨','😌','😔','😪','🤤',
				'😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓',
				'🧐','😕','🫤','😟','🙁','☹️','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰',
				'😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈',
				'👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
			],
		},
		{
			name: 'Symbols',
			icon: '💛',
			emojis: [
				'❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓',
				'💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐',
				'⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑',
				'☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴',
				'🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯',
				'💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅',
				'🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠',
				'Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅',
				'🔵','🟢','🟡','🟠','🔴','🟣','🟤','⚫','⚪','🟥','🟧','🟨','🟩','🟦','🟪','🟫',
				'⬛','⬜','◼️','◻️','◾','◽','▪️','▫️','🔶','🔷','🔸','🔹','🔺','🔻',
			],
		},
		{
			name: 'Flags',
			icon: '🏁',
			emojis: [
				'🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️',
				'🇯🇵','🇰🇷','🇨🇳','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇵🇹','🇧🇷','🇲🇽',
				'🇦🇺','🇨🇦','🇮🇳','🇷🇺','🇹🇭','🇻🇳','🇮🇩','🇵🇭','🇲🇾','🇸🇬','🇹🇼','🇭🇰',
				'🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇮🇪','🇬🇷','🇹🇷','🇪🇬',
				'🇿🇦','🇳🇿','🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇮🇱','🇦🇪','🇸🇦','🇶🇦','🇰🇪','🇳🇬',
			],
		},
	];

	const allEmojis = categories.flatMap((c) => c.emojis.map((e) => ({ emoji: e, category: c.name })));

	let filtered = $derived(
		search.trim()
			? allEmojis.filter(({ emoji }) => emoji.includes(search.trim()))
			: null
	);

	function scrollToCategory(idx: number) {
		activeCategory = idx;
		if (gridEl) {
			const section = gridEl.querySelector(`[data-category-idx="${idx}"]`);
			if (section instanceof HTMLElement) {
				gridEl.scrollTop = section.offsetTop - gridEl.offsetTop;
			}
		}
	}
</script>

<div class="flex flex-col" style="max-width: 280px;">
	<!-- Search -->
	<div class="relative mb-1.5">
		<svg class="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-warm-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
		<input
			type="text"
			bind:value={search}
			placeholder="Search emoji..."
			class="w-full rounded-md border border-warm-200 bg-warm-50 py-1 pl-7 pr-2 text-[11px] font-medium text-warm-600 placeholder:text-warm-300 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/20"
		/>
	</div>

	<!-- Category tabs with no-icon toggle -->
	{#if !search.trim()}
		<div class="mb-1.5 flex items-center gap-0.5 overflow-x-auto pl-0.5">
			<button
				type="button"
				onclick={() => onSelect(null)}
				class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-warm-400 transition-all {selected === null ? 'bg-warm-200 ring-1 ring-warm-400' : 'hover:bg-warm-100'}"
				aria-label="No icon"
			>--</button>
			<div class="mx-0.5 h-4 w-px bg-warm-200"></div>
			{#each categories as cat, idx}
				<button
					type="button"
					onclick={() => scrollToCategory(idx)}
					class="shrink-0 rounded-md px-1.5 py-0.5 text-sm transition-all {activeCategory === idx ? 'bg-warm-200' : 'hover:bg-warm-100'}"
					title={cat.name}
				>{cat.icon}</button>
			{/each}
		</div>
	{/if}

	<!-- Emoji grid -->
	<div bind:this={gridEl} class="overflow-y-auto" style="max-height: 200px;">
		{#if filtered}
			<!-- Search results -->
			<div class="flex flex-wrap gap-0.5">
				{#each filtered as { emoji }}
					<button
						type="button"
						onclick={() => onSelect(emoji)}
						class="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-all {selected === emoji ? 'ring-2 ring-warm-400 ring-offset-1 bg-warm-100 scale-110' : 'hover:bg-warm-50 hover:scale-110'}"
						aria-label="Select {emoji}"
					>{emoji}</button>
				{/each}
				{#if filtered.length === 0}
					<p class="py-3 text-center text-[11px] text-warm-400 w-full">No emoji found</p>
				{/if}
			</div>
		{:else}
			<!-- Categorized view -->
			{#each categories as cat, idx}
				<div data-category-idx={idx} class="mb-1.5">
					<p class="sticky top-0 z-[1] bg-white/95 py-0.5 text-[10px] font-bold text-warm-400 backdrop-blur-sm">{cat.name}</p>
					<div class="flex flex-wrap gap-0.5">
						{#each cat.emojis as emoji}
							<button
								type="button"
								onclick={() => onSelect(emoji)}
								class="flex h-7 w-7 items-center justify-center rounded-md text-sm transition-all {selected === emoji ? 'ring-2 ring-warm-400 ring-offset-1 bg-warm-100 scale-110' : 'hover:bg-warm-50 hover:scale-110'}"
								aria-label="Select {emoji}"
							>{emoji}</button>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
