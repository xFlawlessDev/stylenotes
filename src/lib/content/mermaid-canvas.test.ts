import { beforeAll, describe, expect, it } from 'vitest';
import { createMermaidCanvas } from '$lib/content/mermaid-canvas';

beforeAll(() => {
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	}) as typeof requestAnimationFrame;
});

/** jsdom does not lay out, so stub the geometry the canvas reads. */
function mountStage(
	canvas: ReturnType<typeof createMermaidCanvas>,
	stageSize: { width: number; height: number } = { width: 400, height: 200 },
) {
	document.body.append(canvas.root);
	const stageEl = canvas.root.querySelector<HTMLElement>('.mermaid-canvas-stage');
	if (!stageEl) return null;
	stageEl.getBoundingClientRect = () =>
		({
			width: stageSize.width,
			height: stageSize.height,
			left: 0,
			top: 0,
			right: stageSize.width,
			bottom: stageSize.height,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		}) as DOMRect;
	return stageEl;
}

/** Mirrors what `addMermaidViewer` hands the canvas: a normalized SVG. */
function makeNormalizedSvg(width = 200, height = 100) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.innerHTML = '<path d="M0 0" />';
	return svg;
}

describe('createMermaidCanvas', () => {
	it('applies the view as a translate+scale transform', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg());
		mountStage(canvas);
		canvas.fit();

		const content = canvas.root.querySelector<HTMLElement>('.mermaid-canvas-content');
		expect(content?.style.transform).toMatch(/^translate\(.+px, .+px\) scale\(.+\)$/);
	});

	it('fits the diagram using the viewBox, not the transformed rect', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg());
		mountStage(canvas, { width: 400, height: 200 });
		canvas.fit();

		// 400x200 stage with 32px padding each side -> 336x136 available; the
		// binding constraint is height: 136/100 = 1.36.
		const label = canvas.root.querySelector('.mermaid-zoom-label')?.textContent;
		expect(label).toBe('136%');
	});

	it('scales up to fill a large fullscreen stage', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg(), { fullscreen: true });
		expect(canvas.root.classList.contains('mermaid-fullscreen-canvas')).toBe(true);
		mountStage(canvas, { width: 1000, height: 600 });
		canvas.fit();

		// Whichever axis binds: width (1000-64)/200 = 4.68 vs height (600-64)/100
		// = 5.36 -> 4.68. The fullscreen stage grows the diagram instead of
		// leaving it at its natural size in the corner.
		expect(canvas.root.querySelector('.mermaid-zoom-label')?.textContent).toBe('468%');
	});

	it('stops re-fitting on resize once the user has zoomed', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg());
		mountStage(canvas);
		canvas.fit();
		const fitted = canvas.root.querySelector('.mermaid-zoom-label')?.textContent;

		canvas.root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')?.click();
		const zoomed = canvas.root.querySelector('.mermaid-zoom-label')?.textContent;
		expect(zoomed).not.toBe(fitted);

		// A resize must not reset the user's zoom...
		canvas.fitIfUntouched();
		expect(canvas.root.querySelector('.mermaid-zoom-label')?.textContent).toBe(zoomed);

		// ...until they explicitly fit again.
		canvas.root.querySelector<HTMLButtonElement>('[aria-label="Fit to view"]')?.click();
		expect(canvas.root.querySelector('.mermaid-zoom-label')?.textContent).toBe(fitted);
	});

	it('zooms in and out from the controls', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg());
		mountStage(canvas);
		canvas.fit();

		const zoomIn = canvas.root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]');
		const zoomOut = canvas.root.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]');
		expect(zoomIn).not.toBeNull();
		expect(zoomOut).not.toBeNull();

		zoomIn?.click();
		const afterIn = canvas.root.querySelector('.mermaid-zoom-label')?.textContent;
		zoomOut?.click();
		expect(canvas.root.querySelector('.mermaid-zoom-label')?.textContent).not.toBe(afterIn);
	});

	it('fits from the untransformed size so repeated fits do not compound', () => {
		const canvas = createMermaidCanvas(makeNormalizedSvg(200, 100));
		mountStage(canvas, { width: 400, height: 200 });

		canvas.fit();
		const first = canvas.root.querySelector<HTMLElement>('.mermaid-canvas-content')?.style.transform;
		// Fitting again must be stable: a transformed measurement would halve it.
		canvas.fit();
		const second = canvas.root.querySelector<HTMLElement>('.mermaid-canvas-content')?.style.transform;
		expect(second).toBe(first);
	});
});
