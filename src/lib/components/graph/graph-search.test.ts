import { describe, expect, it } from 'vitest';
import type { GraphNode } from '$lib/content/workspace-graph';
import { searchNodes, stepIndex } from './graph-search';

function node(title: string, degree = 0, kind: GraphNode['kind'] = 'note'): GraphNode {
	return { id: title.toLowerCase(), entityId: title, kind, title, folder: 'Work', orphan: false, degree };
}

const nodes = [
	node('Roadmap', 10),
	node('Roadmap review', 2),
	node('Q3 Roadmap', 5),
	node('Design', 1),
	node('Unrelated', 0),
];

describe('graph-search', () => {
	it('lists everything when the query is empty, most connected first', () => {
		const results = searchNodes(nodes, '');
		expect(results).toHaveLength(5);
		expect(results[0].node.title).toBe('Roadmap');
	});

	it('ranks an exact match above a prefix match', () => {
		const results = searchNodes(nodes, 'roadmap');
		expect(results[0].node.title).toBe('Roadmap');
	});

	it('ranks a word-start match above a mid-word substring', () => {
		// "Roadmap review" is a prefix match (strongest non-exact), "Q3 Roadmap"
		// matches at a word boundary, and "myroadmap" only mid-word.
		const results = searchNodes([node('myroadmap'), node('Q3 Roadmap')], 'roadmap');
		expect(results.map((result) => result.node.title)).toEqual(['Q3 Roadmap', 'myroadmap']);
	});

	it('orders prefix, word-start, then mid-word matches', () => {
		const results = searchNodes([node('myroadmap'), node('Q3 Roadmap'), node('Roadmap review')], 'roadmap');
		expect(results.map((result) => result.node.title)).toEqual(['Roadmap review', 'Q3 Roadmap', 'myroadmap']);
	});

	it('excludes non-matching nodes', () => {
		const results = searchNodes(nodes, 'roadmap');
		expect(results.map((result) => result.node.title)).not.toContain('Design');
	});

	it('is case- and whitespace-insensitive', () => {
		expect(searchNodes(nodes, '  ROADMAP ')[0].node.title).toBe('Roadmap');
	});

	it('breaks ties on degree', () => {
		const tied = [node('Alpha', 1), node('Alpha', 9)];
		const results = searchNodes(tied, 'alpha');
		expect(results[0].node.degree).toBe(9);
	});

	it('respects the result limit', () => {
		expect(searchNodes(nodes, '', 2)).toHaveLength(2);
	});

	it('treats regex metacharacters as literal text', () => {
		const special = [node('a+b'), node('axb')];
		const results = searchNodes(special, 'a+b');
		expect(results.map((result) => result.node.title)).toEqual(['a+b']);
	});

	it('wraps the highlight index in both directions', () => {
		expect(stepIndex(0, -1, 3)).toBe(2);
		expect(stepIndex(2, 1, 3)).toBe(0);
		expect(stepIndex(0, 1, 0)).toBe(0);
	});
});
