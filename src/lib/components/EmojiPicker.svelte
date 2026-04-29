<script lang="ts">
	type EmojiCategory = { name: string; icon: string; emojis: string[] };

	let { selected = null, onSelect }: { selected: string | null; onSelect: (emoji: string | null) => void } = $props();

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

	let scrollingTo = false;

	function scrollToCategory(idx: number) {
		activeCategory = idx;
		scrollingTo = true;
		if (gridEl) {
			const section = gridEl.querySelector(`[data-category-idx="${idx}"]`);
			if (section instanceof HTMLElement) {
				gridEl.scrollTop = section.offsetTop - gridEl.offsetTop;
			}
		}
		setTimeout(() => { scrollingTo = false; }, 100);
	}

	function handleGridScroll() {
		if (scrollingTo || !gridEl) return;
		const gridTop = gridEl.scrollTop;
		let best = 0;
		for (let i = categories.length - 1; i >= 0; i--) {
			const section = gridEl.querySelector(`[data-category-idx="${i}"]`);
			if (section instanceof HTMLElement) {
				const offset = section.offsetTop - gridEl.offsetTop;
				if (gridTop >= offset - 8) {
					best = i;
					break;
				}
			}
		}
		activeCategory = best;
	}
</script>

<div class="flex flex-col" style="max-width: 320px;">
	<!-- Category tabs with no-icon toggle -->
	<div class="mb-1.5 flex items-center gap-0.5 overflow-x-auto pl-0.5">
		<button
			type="button"
			onclick={() => onSelect(null)}
			class="shrink-0 rounded-md px-1.5 py-1 text-sm font-medium text-warm-400 transition-all {selected === null ? 'bg-warm-200 ring-1 ring-warm-400' : 'hover:bg-warm-100'}"
			aria-label="No icon"
		>--</button>
		<div class="mx-0.5 h-5 w-px bg-warm-200"></div>
		{#each categories as cat, idx}
			<button
				type="button"
				onclick={() => scrollToCategory(idx)}
				class="shrink-0 rounded-md px-1.5 py-1 text-base transition-all {activeCategory === idx ? 'bg-warm-200' : 'hover:bg-warm-100'}"
				title={cat.name}
			>{cat.icon}</button>
		{/each}
	</div>

	<!-- Emoji grid -->
	<div bind:this={gridEl} class="overflow-y-auto" style="max-height: 240px;" onscroll={handleGridScroll}>
		{#each categories as cat, idx}
			<div data-category-idx={idx} class="mb-1.5">
				<p class="sticky top-0 z-[1] bg-white/95 py-0.5 text-xs font-bold text-warm-400 backdrop-blur-sm">{cat.name}</p>
				<div class="flex flex-wrap gap-0.5">
					{#each cat.emojis as emoji}
						<button
							type="button"
							onclick={() => onSelect(emoji)}
							class="flex h-9 w-9 items-center justify-center rounded-md text-lg transition-all {selected === emoji ? 'ring-2 ring-warm-400 ring-offset-1 bg-warm-100 scale-110' : 'hover:bg-warm-50 hover:scale-110'}"
							aria-label="Select {emoji}"
						>{emoji}</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>
