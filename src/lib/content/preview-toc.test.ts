import { describe, expect, it } from 'vitest';
import {
	activeTocIndex,
	cleanHeadingText,
	parseHeadings,
	tocFromHtml,
	tocIndent,
} from '$lib/content/preview-toc';

describe('preview table of contents helpers', () => {
	it('reads id, level and text from rendered headings', () => {
		const html = '<h1 id="intro">Intro</h1><p>body</p><h2 id="details">Details</h2>';
		expect(parseHeadings(html)).toEqual([
			{ level: 1, text: 'Intro', slug: 'intro' },
			{ level: 2, text: 'Details', slug: 'details' },
		]);
	});

	it('ignores heading-looking text inside code fences and headings without an id', () => {
		const html =
			'<pre><code>&lt;h2&gt;not a heading&lt;/h2&gt;</code></pre><h2>no id</h2><h3 id="real">Real</h3>';
		expect(parseHeadings(html)).toEqual([{ level: 3, text: 'Real', slug: 'real' }]);
	});

	it('only keeps body headings marked with data-toc-digest', () => {
		const html =
			'<h2 id="a" data-toc-digest>Body</h2><div class="mermaid-diagram"><text id="label">Arrow</text></div><h4 id="b" data-toc-digest>More</h4>';
		expect(tocFromHtml(html)).toEqual([
			{ level: 2, text: 'Body', slug: 'a' },
			{ level: 4, text: 'More', slug: 'b' },
		]);
	});

	it('strips wiki links, markdown marks and images from labels', () => {
		expect(cleanHeadingText('The `**bold**` part')).toBe('The bold part');
		expect(cleanHeadingText('[[Other Note|Custom label]]')).toBe('Custom label');
		expect(cleanHeadingText('[[Other Note#Section]]')).toBe('Other Note');
		expect(cleanHeadingText('[text](https://example.com)')).toBe('text');
		expect(cleanHeadingText('![shot](asset://a.png) done')).toBe('shot done');
	});

	it('highlights the last heading above the reading line', () => {
		const offsets = [
			{ slug: 'a', top: -400 },
			{ slug: 'b', top: -100 },
			{ slug: 'c', top: 120 },
		];
		expect(activeTocIndex(offsets, 0)).toBe(1);
		expect(activeTocIndex(offsets, -500)).toBe(-1);
		expect(activeTocIndex(offsets, 900)).toBe(2);
		expect(activeTocIndex([], 0)).toBe(-1);
	});

	it('staircases indentation to the levels actually present', () => {
		expect(tocIndent([2, 2, 3, 2, 4])).toEqual([0, 0, 1, 0, 2]);
		expect(tocIndent([1, 2])).toEqual([0, 1]);
		expect(tocIndent([])).toEqual([]);
	});
});
