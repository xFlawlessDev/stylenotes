import { createMermaidCanvas } from '$lib/content/mermaid-canvas';
import { createExportMenu } from '$lib/content/mermaid-export-menu';
import { el, iconButton, onActivate } from '$lib/content/mermaid-dom';
import { openMermaidFullscreen } from '$lib/content/mermaid-fullscreen';
import { currentLocale, tFor } from '$lib/i18n/index.svelte';

/**
 * Wires the interactive Mermaid viewer (header actions, pan/zoom canvas and a
 * full-screen overlay) onto a `.mermaid-diagram` node.
 *
 * The preview pipeline produces sanitized HTML strings which surfaces insert
 * with `{@html}`; the browser re-parses that markup, so listeners bound before
 * insertion are lost. Surfaces therefore call `hydrateMermaidDiagrams` on the
 * live container after rendering (see the `hydrateMermaid` action).
 */

const HYDRATED = 'hydrated';

/**
 * Mermaid sizes its SVG with `width="100%"` plus an inline `max-width: Npx`.
 * Inside the canvas the parent is an absolutely-positioned shrink-to-fit box,
 * so `100%` resolves to ~0 and the diagram renders tiny. Normalizing the SVG to
 * its intrinsic viewBox size gives the transform a real box to scale.
 */
function normalizeSvgSize(svg: SVGSVGElement) {
	const box = svg.viewBox?.baseVal;
	if (!box || box.width <= 0 || box.height <= 0) return;

	// Drop the responsive styling so the concrete dimensions take effect.
	svg.removeAttribute('style');
	svg.setAttribute('width', String(box.width));
	svg.setAttribute('height', String(box.height));
}

function diagramSvg(diagram: HTMLElement): SVGSVGElement | null {
	return diagram.querySelector<SVGSVGElement>(':scope > svg');
}

function createHeader(svg: SVGSVGElement): HTMLElement {
	const header = el('div', 'mermaid-diagram-header');
	const title = el('span', 'mermaid-diagram-title');
	// Plain DOM, outside any Svelte component: the label is resolved once from
	// the locale that was active when the preview rendered.
	title.textContent = tFor(currentLocale(), 'editor.mermaid.title');

	const actions = el('div', 'mermaid-header-actions');
	const fullscreen = iconButton('maximize', tFor(currentLocale(), 'editor.mermaid.openFullscreen'));
	onActivate(fullscreen, () => openMermaidFullscreen(svg));
	actions.append(fullscreen, createExportMenu(svg));

	header.append(title, actions);
	return header;
}

/** Adds the header and canvas to one diagram node. Idempotent. */
export function addMermaidViewer(diagram: HTMLElement) {
	if (diagram.dataset[HYDRATED] === 'true') return;
	const svg = diagramSvg(diagram);
	if (!svg) return;
	diagram.dataset[HYDRATED] = 'true';

	normalizeSvgSize(svg);
	const canvas = createMermaidCanvas(svg);
	diagram.append(createHeader(svg), canvas.root);

	// Sizes are zero until the node is in the document, so fit on the next
	// frame. Afterwards, only re-fit on resize while the user has not panned or
	// zoomed — otherwise a panel resize would throw away their view.
	requestAnimationFrame(() => canvas.fit());

	if (typeof ResizeObserver === 'undefined') return;
	const observer = new ResizeObserver(() => canvas.fitIfUntouched());
	observer.observe(canvas.root);
}

/** Hydrates every diagram inside a freshly rendered preview subtree. */
export function hydrateMermaidDiagrams(root: ParentNode | null | undefined) {
	if (!root) return;
	for (const diagram of root.querySelectorAll<HTMLElement>('.mermaid-diagram')) {
		addMermaidViewer(diagram);
	}
}

/**
 * Svelte action for preview containers that render `{@html}`.
 *
 * `{@html}` replaces the container's children whenever the rendered string
 * changes, discarding the hydrated chrome. A `MutationObserver` re-hydrates
 * after every such swap, so the viewer survives streaming AI replies and
 * live-preview edits. Re-hydration is a no-op for diagrams already wired, and
 * a microtask guard keeps our own appends from looping.
 */
export function hydrateMermaid(node: HTMLElement) {
	hydrateMermaidDiagrams(node);
	if (typeof MutationObserver === 'undefined') return {};

	let queued = false;
	const observer = new MutationObserver(() => {
		if (queued) return;
		queued = true;
		queueMicrotask(() => {
			queued = false;
			hydrateMermaidDiagrams(node);
		});
	});
	observer.observe(node, { childList: true, subtree: true });

	return {
		update() {
			hydrateMermaidDiagrams(node);
		},
		destroy() {
			observer.disconnect();
		},
	};
}
