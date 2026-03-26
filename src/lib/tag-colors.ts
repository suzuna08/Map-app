const TAG_PALETTE = [
	'#A5834F', // muted gold / ochre
	'#8C8B82', // stone sage / warm grey
	'#7489A6', // slate blue / dusty denim
	'#936756', // terracotta / clay
	'#5B7D8A', // muted teal / deep sea
	'#6A6196', // dusty purple / slate lavender
];

const LIGHT_BG_SET = new Set<string>();

export { TAG_PALETTE };

export function textColorForBg(bg: string): string {
	return LIGHT_BG_SET.has(bg.toLowerCase()) ? '#3a3028' : '#ffffff';
}

function hashString(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
	}
	return hash;
}

export function colorForTag(name: string): string {
	const normalized = name.toLowerCase().trim().replace(/\s+/g, ' ');
	const index = hashString(normalized) % TAG_PALETTE.length;
	return TAG_PALETTE[index];
}
