import { createMermaidCanvas } from '$lib/content/mermaid-canvas';
import { el, iconButton, onActivate } from '$lib/content/mermaid-dom';

/**
 * Roomier canvas for one diagram, layered over the whole window. Built as plain
 * DOM so it can be opened from any preview surface without a portal.
 */
export function openMermaidFullscreen(svg: SVGSVGElement): () => void {
	const overlay = el('div', 'mermaid-fullscreen-overlay');
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');
	overlay.setAttribute('aria-label', 'Mermaid diagram');

	const holder = el('div', 'mermaid-fullscreen-body');
	let destroyed = false;

	const closeButton = iconButton('close', 'Close full screen');
	closeButton.classList.add('mermaid-fullscreen-close');

	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
		document.removeEventListener('keydown', onKey, true);
		overlay.remove();
	};

	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		destroy();
	};

	onActivate(closeButton, destroy);
	overlay.addEventListener('pointerdown', (event) => {
		if (event.target === overlay) destroy();
	});
	document.addEventListener('keydown', onKey, true);

	// Clone the rendered SVG and hand it to a fresh canvas inside the overlay.
	const canvas = createMermaidCanvas(svg.cloneNode(true) as SVGSVGElement, { fullscreen: true });
	holder.append(canvas.root);
	overlay.append(holder, closeButton);
	document.body.append(overlay);

	// Fit once the overlay has been laid out (sizes are zero while detached).
	requestAnimationFrame(() => canvas.fit());

	return destroy;
}
