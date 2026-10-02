/**
 * Find-in-note matching.
 *
 * Pure string math shared by the editor textarea (mirror overlay) and the
 * preview (CSS Custom Highlight). It knows nothing about the DOM, so the
 * count/active-index behaviour is unit-tested here and the components only
 * paint the result.
 */

export type FindMatch = { start: number; end: number };

export type FindOptions = { caseSensitive?: boolean };

/**
 * Every non-overlapping occurrence of `query` in `text`, in document order.
 * An empty query matches nothing (rather than everything at every offset).
 */
export function findMatches(text: string, query: string, options: FindOptions = {}): FindMatch[] {
	if (!query) return [];
	const haystack = options.caseSensitive ? text : text.toLowerCase();
	const needle = options.caseSensitive ? query : query.toLowerCase();
	const matches: FindMatch[] = [];
	let from = 0;
	while (from <= haystack.length - needle.length) {
		const index = haystack.indexOf(needle, from);
		if (index < 0) break;
		matches.push({ start: index, end: index + needle.length });
		from = index + needle.length;
	}
	return matches;
}

/** The next/previous index, wrapping at both ends. `-1` starts at the first. */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
	if (total <= 0) return -1;
	if (current < 0) return direction === 1 ? 0 : total - 1;
	return (current + direction + total) % total;
}

export type FindSegment = { text: string; match: boolean; active: boolean };

/**
 * Splits `text` at the match boundaries so a component can render one
 * `<mark>` per hit without ever touching `{@html}`.
 */
export function findSegments(
	text: string,
	matches: FindMatch[],
	activeIndex: number
): FindSegment[] {
	const segments: FindSegment[] = [];
	let cursor = 0;
	matches.forEach((match, index) => {
		if (match.start > cursor) {
			segments.push({ text: text.slice(cursor, match.start), match: false, active: false });
		}
		segments.push({
			text: text.slice(match.start, match.end),
			match: true,
			active: index === activeIndex
		});
		cursor = match.end;
	});
	if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false, active: false });
	return segments;
}
