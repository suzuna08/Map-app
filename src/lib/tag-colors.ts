const TAG_PALETTE = [
	'#c4898a', // rose
	'#b89760', // amber
	'#8a9462', // olive
	'#6a9b96', // teal
	'#7b8fa8', // slate blue
	'#9a7f9e', // purple
	'#c08878', // salmon
	'#b07c6a', // brown
	'#7882a0', // steel
	'#a88290'  // mauve
];

export { TAG_PALETTE };

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
