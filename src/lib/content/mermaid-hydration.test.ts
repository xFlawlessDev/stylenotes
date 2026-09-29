/**
 * Integration check: the exact path a preview surface takes —
 * `renderNotePreviewHtml` produces HTML, `{@html}` inserts it, then the
 * `hydrateMermaid` action wires the viewer onto the live nodes.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { renderNoteHtml } from '$lib/content/note-actions';
import { renderNotePreviewHtml } from '$lib/content/mermaid-preview';
import { hydrateMermaid } from '$lib/content/mermaid-viewer';

beforeAll(() => {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
		cb(0);
		return 0;
	}) as typeof requestAnimationFrame;
});

describe('mermaid viewer hydration', () => {
	it('wires header, export menu and canvas onto rendered preview HTML', async () => {
		const html = await renderNotePreviewHtml(
			await renderNoteHtml('```mermaid\nflowchart LR\n  A --> B\n```'),
			async () => '<svg viewBox="0 0 200 100"><text>A</text></svg>',
		);

		// Mirrors what `{@html html}` does: parse the string into live nodes.
		const host = document.createElement('div');
		host.className = 'markdown-body';
		host.innerHTML = html;
		hydrateMermaid(host);

		expect(host.querySelector('.mermaid-diagram-header')).not.toBeNull();
		expect(host.querySelector('.mermaid-canvas-stage')).not.toBeNull();

		const exportButton = host.querySelector<HTMLButtonElement>('.mermaid-export-button');
		expect(exportButton).not.toBeNull();
		exportButton?.click();

		const menu = host.querySelector<HTMLElement>('.mermaid-export-menu');
		expect(menu?.hidden).toBe(false);
		expect(menu?.querySelectorAll('.mermaid-export-item')).toHaveLength(2);
		expect(exportButton?.getAttribute('aria-expanded')).toBe('true');

		// Idempotent: re-running the action must not double the chrome.
		hydrateMermaid(host);
		expect(host.querySelectorAll('.mermaid-canvas-stage')).toHaveLength(1);
	});

	it('does not hydrate a diagram that failed to render', async () => {
		const html = await renderNotePreviewHtml(
			await renderNoteHtml('```mermaid\nbroken\n```'),
			async () => Promise.reject(new Error('bad')),
		);
		const host = document.createElement('div');
		host.innerHTML = html;
		hydrateMermaid(host);
		expect(host.querySelector('.mermaid-diagram-header')).toBeNull();
	});

	it('re-hydrates after {@html}-style innerHTML replacement', async () => {
		const build = async (label: string) =>
			renderNotePreviewHtml(
				await renderNoteHtml('```mermaid\nflowchart LR\n  A --> B\n```'),
				async () => `<svg viewBox="0 0 200 100"><text>${label}</text></svg>`,
			);
		const firstHtml = await build('One');
		const secondHtml = await build('Two');

		const host = document.createElement('div');
		host.innerHTML = firstHtml;
		const action = hydrateMermaid(host);
		expect(host.querySelector('.mermaid-canvas-stage')).not.toBeNull();

		// Simulate a re-render: Svelte assigns innerHTML, dropping all listeners.
		host.innerHTML = secondHtml;
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(host.querySelector('.mermaid-diagram-header')).not.toBeNull();
		expect(host.querySelector('.mermaid-canvas-content text')?.textContent).toBe('Two');
		expect(host.querySelector('.mermaid-export-button')).not.toBeNull();
		(action as { destroy?: () => void }).destroy?.();
	});
});
