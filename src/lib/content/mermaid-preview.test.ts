import { describe, expect, it } from 'vitest';
import { renderNoteHtml } from '$lib/content/note-actions';
import { renderMermaidBlocks, renderNotePreviewHtml } from '$lib/content/mermaid-preview';

describe('renderMermaidBlocks', () => {
	it('renders Mermaid blocks and sanitizes generated SVG', async () => {
		const html = await renderMermaidBlocks(
			'<pre><code class="language-mermaid">flowchart LR\\nA --&gt; B</code></pre>',
			async () => '<svg onload="alert(1)"><script>alert(1)</script><path d="M0 0" /></svg>',
		);

		expect(html).toContain('class="mermaid-diagram"');
		expect(html).toContain('<svg');
		expect(html).toContain('<path');
		expect(html).not.toContain('onload');
		expect(html).not.toContain('<script');
	});

	it('keeps the original fenced block when rendering fails', async () => {
		const source = '<pre><code class="language-mermaid">invalid syntax</code></pre>';
		const html = await renderMermaidBlocks(source, async () => Promise.reject(new Error('invalid')));

		expect(html).toContain('<pre><code class="language-mermaid">invalid syntax</code></pre>');
		expect(html).not.toContain('data-preview-action="download-svg"');
	});
});

describe('renderNotePreviewHtml', () => {
	it('renders Mermaid fences with the injected renderer', async () => {
		const html = await renderNotePreviewHtml(
			await renderNoteHtml('```mermaid\nflowchart LR\nA[Start] --> B[End]\n```'),
			async (_source, id) => `<svg id="${id}"><text>Start</text><text>End</text></svg>`,
		);

		expect(html).toContain('class="mermaid-diagram"');
		expect(html).toContain('<svg');
		expect(html).toContain('Start');
		expect(html).toContain('End');
		expect(html).toContain('data-preview-action="download-svg"');
		expect(html).toContain('data-preview-action="download-png"');
	});

	it('leaves ordinary markdown and non-Mermaid fences intact', async () => {
		const html = await renderNotePreviewHtml(await renderNoteHtml('```ts\nconst value = 1;\n```'));
		expect(html).toContain('<code class="language-ts">');
		expect(html).toContain('value');
		expect(html).toContain('1');
	}, 15000);
});
