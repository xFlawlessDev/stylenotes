import { beforeEach, describe, expect, it } from 'vitest';
import {
	anchorHeadings,
	headingOffsets,
	scrollPreviewToHeading,
	trackPreviewHeadings,
} from '$lib/content/preview-toc-sync';

/** jsdom has no layout, so heading rectangles are stubbed per element. */
function stubTop(element: HTMLElement, top: number) {
	element.getBoundingClientRect = () => ({ ...DOMRect.fromRect({ y: top }), top }) as DOMRect;
}

function buildPreview(headings: [string, number][]): HTMLDivElement {
	const root = document.createElement('div');
	const body = document.createElement('div');
	body.className = 'markdown-body';
	for (const [id, top] of headings) {
		const heading = document.createElement('h2');
		heading.id = id;
		stubTop(heading, top);
		body.append(heading);
	}
	root.append(body);
	stubTop(root, 0);
	document.body.append(root);
	return root;
}

describe('preview table of contents sync', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('anchors only id-bearing body headings, never Mermaid labels', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<h2 id="a">A</h2><h2>no id</h2><div class="mermaid-diagram"><h3 id="label">Arrow</h3></div>';
		expect(anchorHeadings(root).map((heading) => heading.id)).toEqual(['a']);
	});

	it('measures heading offsets relative to the scroll container', () => {
		const root = buildPreview([['a', 40], ['b', 180]]);
		stubTop(root, 10);
		expect(headingOffsets(root, anchorHeadings(root))).toEqual([
			{ slug: 'a', top: 30 },
			{ slug: 'b', top: 170 },
		]);
	});

	it('reports the heading above the container top and re-syncs on scroll', async () => {
		const root = buildPreview([['a', -120], ['b', 60]]);
		const seen: number[] = [];
		const stop = trackPreviewHeadings(root, (index) => seen.push(index));
		expect(seen.at(-1)).toBe(0);

		stubTop(root.querySelector('#a')!, -300);
		root.dispatchEvent(new Event('scroll'));
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(seen.at(-1)).toBe(0);

		stubTop(root.querySelector('#b')!, -10);
		root.dispatchEvent(new Event('scroll'));
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(seen.at(-1)).toBe(1);

		stop();
		root.dispatchEvent(new Event('scroll'));
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(seen.at(-1)).toBe(1);
	});

	it('clamps a jump to the container instead of scrolling the whole page', () => {
		const root = buildPreview([['a', 25], ['b', 500]]);
		root.scrollTop = 100;
		stubTop(root, -100);
		scrollPreviewToHeading(root, 'b');
		expect(root.scrollTop).toBe(700);
	});

	it('does nothing for an unknown or empty id', () => {
		const root = buildPreview([['a', 25]]);
		root.scrollTop = 42;
		scrollPreviewToHeading(root, 'missing');
		scrollPreviewToHeading(root, '');
		expect(root.scrollTop).toBe(42);
	});
});
