import type { GraphNode } from '$lib/content/workspace-graph';

/**
 * Ranking for the graph's node search.
 *
 * A plain `includes` scan lists every substring match in arbitrary order, which
 * buries the obvious answer behind incidental ones. Ranking prefers, in order:
 * exact match, prefix match, word-start match, then any substring — and breaks
 * ties by degree, so the most connected node wins.
 *
 * Pure and free of DOM access, so it is unit-testable.
 */

export type SearchResult = { node: GraphNode; score: number };

/** How many results the panel shows at once. */
export const SEARCH_LIMIT = 40;

function scoreMatch(title: string, term: string): number {
	if (title === term) return 1000;
	if (title.startsWith(term)) return 500;
	// A match at a word boundary beats a match in the middle of a word.
	if (new RegExp(`(^|\\s)${escapeRegExp(term)}`).test(title)) return 250;
	return 100;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rank nodes against `query`. An empty query lists everything, most connected
 * first, so the panel doubles as a browse view.
 */
export function searchNodes(nodes: readonly GraphNode[], query: string, limit = SEARCH_LIMIT): SearchResult[] {
	const term = query.trim().toLocaleLowerCase();
	const results: SearchResult[] = [];

	for (const node of nodes) {
		const title = node.title.toLocaleLowerCase();
		if (!term) {
			results.push({ node, score: node.degree });
			continue;
		}
		if (!title.includes(term)) continue;
		results.push({ node, score: scoreMatch(title, term) + node.degree / 100 });
	}

	return results
		.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title))
		.slice(0, limit);
}

/**
 * Move a highlight index by `delta`, wrapping around. Kept here so the keyboard
 * behaviour is testable without a component.
 */
export function stepIndex(current: number, delta: number, length: number): number {
	if (length <= 0) return 0;
	return (current + delta + length) % length;
}
