import { beforeAll, describe, expect, it } from 'vitest';
import { addMermaidViewer, hydrateMermaidDiagrams } from '$lib/content/mermaid-viewer';

beforeAll(() => {
	// jsdom has no ResizeObserver; the viewer degrades to a one-shot fit.
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
		callback(0);
		return 0;
	}) as typeof requestAnimationFrame;
});

function diagram(svg = '<svg viewBox="0 0 100 60"><path d="M0 0" /></svg>'): HTMLElement {
	const node = document.createElement('div');
	node.className = 'mermaid-diagram';
	node.innerHTML = svg;
	return node;
}

describe('addMermaidViewer', () => {
	it('adds the header, canvas and controls to a diagram', () => {
		const node = diagram();
		addMermaidViewer(node);

		expect(node.querySelector('.mermaid-diagram-header')).not.toBeNull();
		expect(node.querySelector('.mermaid-diagram-title')?.textContent).toBe('Diagram');
		expect(node.querySelector('.mermaid-canvas-stage')).not.toBeNull();
		expect(node.querySelector('.mermaid-export-button')).not.toBeNull();
		// SVG lives inside the transformable content layer.
		expect(node.querySelector('.mermaid-canvas-content > svg')).not.toBeNull();
	});

	it('normalizes Mermaid responsive sizing to intrinsic pixel dimensions', () => {
		// What mermaid.render actually emits: width=100% + inline max-width.
		const node = diagram(
			'<svg width="100%" style="max-width: 320px;" viewBox="0 0 320 180"><path d="M0 0" /></svg>',
		);
		addMermaidViewer(node);

		const svg = node.querySelector('.mermaid-canvas-content > svg');
		expect(svg?.getAttribute('width')).toBe('320');
		expect(svg?.getAttribute('height')).toBe('180');
		expect(svg?.hasAttribute('style')).toBe(false);
	});

	it('is idempotent', () => {
		const node = diagram();
		addMermaidViewer(node);
		addMermaidViewer(node);
		expect(node.querySelectorAll('.mermaid-canvas-stage')).toHaveLength(1);
		expect(node.querySelectorAll('.mermaid-diagram-header')).toHaveLength(1);
	});

	it('ignores a diagram without an SVG', () => {
		const node = document.createElement('div');
		node.className = 'mermaid-diagram';
		node.innerHTML = '<p>failed</p>';
		addMermaidViewer(node);
		expect(node.querySelector('.mermaid-diagram-header')).toBeNull();
	});

	it('opens the full-screen overlay with a canvas-filling stage', () => {
		const node = diagram(
			'<svg width="100%" style="max-width: 320px;" viewBox="0 0 320 180"><path d="M0 0" /></svg>',
		);
		addMermaidViewer(node);
		const button = node.querySelector<HTMLButtonElement>(
			'.mermaid-header-actions .mermaid-icon-button',
		);
		expect(button).not.toBeNull();

		button?.click();
		const overlay = document.querySelector('.mermaid-fullscreen-overlay');
		expect(overlay).not.toBeNull();

		// The overlay canvas must be the fullscreen variant (flex-grow stage)
		// and the cloned SVG must keep its normalized dimensions.
		expect(overlay?.querySelector('.mermaid-fullscreen-canvas')).not.toBeNull();
		expect(overlay?.querySelector('.mermaid-diagram-canvas')).toBeNull();
		const clone = overlay?.querySelector('.mermaid-canvas-content > svg');
		expect(clone?.getAttribute('width')).toBe('320');
		expect(clone?.getAttribute('height')).toBe('180');

		overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('.mermaid-fullscreen-overlay')).toBeNull();
	});
});

describe('hydrateMermaidDiagrams', () => {
	it('walks a container and hydrates every diagram', () => {
		const root = document.createElement('div');
		root.append(diagram(), document.createElement('p'), diagram());
		hydrateMermaidDiagrams(root);
		expect(root.querySelectorAll('.mermaid-diagram-header')).toHaveLength(2);
	});

	it('tolerates a missing container', () => {
		expect(() => hydrateMermaidDiagrams(null)).not.toThrow();
	});
});
