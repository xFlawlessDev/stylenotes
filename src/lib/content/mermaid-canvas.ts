import { el, iconButton, onActivate } from '$lib/content/mermaid-dom';
import { currentLocale, tFor } from '$lib/i18n/index.svelte';
import {
	formatZoom,
	fitView,
	normalizeView,
	panBy,
	zoomAt,
	zoomTo,
	INITIAL_MERMAID_VIEW,
	MERMAID_ZOOM_STEP,
	type MermaidView,
} from '$lib/content/mermaid-view';

/**
 * Pan/zoom canvas for one diagram. Built with plain DOM so it can be attached
 * to nodes produced by the HTML-string preview pipeline (which is re-parsed by
 * `{@html}`, dropping any listener bound before insertion).
 *
 * Returns the root element plus `fit` (force the diagram to fit the stage) and
 * `fitIfUntouched` (used by the resize observer so a panel resize never throws
 * away a view the user panned or zoomed). Both are no-ops while the element is
 * detached, since sizes read there are zero.
 */
export function createMermaidCanvas(
	svg: SVGSVGElement,
	{ fullscreen = false }: { fullscreen?: boolean } = {},
): {
	root: HTMLElement;
	fit: () => void;
	/** Re-fits only while the user has not panned or zoomed. */
	fitIfUntouched: () => void;
} {
	const root = el('div', fullscreen ? 'mermaid-fullscreen-canvas' : 'mermaid-diagram-canvas');
	const stage = el('div', 'mermaid-canvas-stage');
	const content = el('div', 'mermaid-canvas-content');
	content.append(svg);
	stage.append(content);

	let view: MermaidView = { ...INITIAL_MERMAID_VIEW };
	/** Set once the user pans or zooms, so resize re-fits stop overriding them. */
	let touched = false;
	const apply = () => {
		content.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
	};

	const label = el('span', 'mermaid-zoom-label');
	const syncLabel = () => (label.textContent = formatZoom(view.scale));
	syncLabel();

	const rect = () => stage.getBoundingClientRect();
	/**
	 * Intrinsic diagram size, independent of the canvas transform.
	 *
	 * `getBoundingClientRect` would include the parent's `scale()`, so re-fitting
	 * after a zoom would compound. `addMermaidViewer` normalizes the SVG to its
	 * viewBox pixel size, so the width/height attributes are authoritative; the
	 * viewBox and layout box are fallbacks for other callers.
	 */
	const size = () => {
		const widthAttr = Number.parseFloat(svg.getAttribute('width') ?? '');
		const heightAttr = Number.parseFloat(svg.getAttribute('height') ?? '');
		if (widthAttr > 0 && heightAttr > 0) return { width: widthAttr, height: heightAttr };

		const box = svg.viewBox?.baseVal;
		if (box && box.width > 0 && box.height > 0) {
			return { width: box.width, height: box.height };
		}
		return { width: svg.clientWidth, height: svg.clientHeight };
	};

	const fit = () => {
		const box = rect();
		const diagram = size();
		view = fitView(box.width, box.height, diagram.width, diagram.height);
		apply();
		syncLabel();
	};

	const zoomBy = (factor: number, originX: number, originY: number) => {
		touched = true;
		view = normalizeView(zoomAt(view, factor, originX, originY));
		apply();
		syncLabel();
	};

	const zoomCenter = (factor: number) => {
		const box = rect();
		zoomBy(factor, box.width / 2, box.height / 2);
	};

	const controls = el('div', 'mermaid-canvas-controls');
	const locale = currentLocale();
	const out = iconButton('minus', tFor(locale, 'editor.mermaid.zoomOut'));
	onActivate(out, () => zoomCenter(1 / MERMAID_ZOOM_STEP));
	const zoomReset = el('button', 'mermaid-zoom-label-button');
	zoomReset.type = 'button';
	zoomReset.title = tFor(locale, 'editor.mermaid.zoomReset');
	zoomReset.append(label);
	onActivate(zoomReset, () => {
		const box = rect();
		touched = true;
		view = normalizeView(zoomTo(view, 1, box.width / 2, box.height / 2));
		apply();
		syncLabel();
	});
	const zin = iconButton('plus', tFor(locale, 'editor.mermaid.zoomIn'));
	onActivate(zin, () => zoomCenter(MERMAID_ZOOM_STEP));
	const fitBtn = iconButton('fit', tFor(locale, 'editor.mermaid.fit'));
	onActivate(fitBtn, () => {
		touched = false;
		fit();
	});
	const resetBtn = iconButton('reset', tFor(locale, 'editor.mermaid.resetView'));
	onActivate(resetBtn, () => {
		touched = true;
		view = { ...INITIAL_MERMAID_VIEW };
		apply();
		setTimeout(fit, 0);
	});
	controls.append(out, zoomReset, zin, fitBtn, resetBtn);

	root.append(stage, controls);

	stage.addEventListener(
		'wheel',
		(event) => {
			event.preventDefault();
			const box = rect();
			zoomBy(
				event.deltaY < 0 ? MERMAID_ZOOM_STEP : 1 / MERMAID_ZOOM_STEP,
				event.clientX - box.left,
				event.clientY - box.top,
			);
		},
		{ passive: false },
	);

	let last: { x: number; y: number } | null = null;
	stage.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		last = { x: event.clientX, y: event.clientY };
		stage.classList.add('dragging');
		stage.setPointerCapture(event.pointerId);
	});
	stage.addEventListener('pointermove', (event) => {
		if (!last) return;
		touched = true;
		view = normalizeView(panBy(view, event.clientX - last.x, event.clientY - last.y));
		last = { x: event.clientX, y: event.clientY };
		apply();
	});
	const endDrag = (event: PointerEvent) => {
		if (!last) return;
		last = null;
		stage.classList.remove('dragging');
		if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
	};
	stage.addEventListener('pointerup', endDrag);
	stage.addEventListener('pointercancel', endDrag);
	stage.addEventListener('dblclick', () => {
		touched = false;
		fit();
	});

	return {
		root,
		fit,
		fitIfUntouched: () => {
			if (!touched) fit();
		},
	};
}
