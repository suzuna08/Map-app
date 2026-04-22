export function normalizeTagName(name: string): string {
	return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function toDisplayName(name: string): string {
	const cleaned = name.trim().replace(/\s+/g, ' ');
	if (cleaned !== cleaned.toLowerCase()) return cleaned;
	return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
