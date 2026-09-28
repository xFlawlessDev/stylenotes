/** Short, human relative time for version rows ("just now", "12m ago", "3d ago"). */
export function formatRelative(epochMs: number, now = Date.now()): string {
	const diff = Math.max(0, now - epochMs);
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(epochMs).toLocaleDateString();
}

/** One-line preview of a version payload for the history list. */
export function versionPreview(payload: unknown): string {
	if (!payload || typeof payload !== 'object') return '';
	const record = payload as { body?: unknown; notes?: unknown; title?: unknown };
	const text =
		typeof record.body === 'string'
			? record.body
			: typeof record.notes === 'string'
				? record.notes
				: '';
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat) return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
	return typeof record.title === 'string' ? record.title : '';
}
