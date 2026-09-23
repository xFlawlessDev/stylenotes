import { describe, it, expect } from 'vitest';
import {
	escapeHtml,
	markdownBaseName,
	noteFileName,
	notePrintDocument,
	renderNoteHtml,
} from '$lib/content/note-actions';
import { createNote } from '$lib/content/content';

describe('renderNoteHtml', () => {
	it('keeps asset protocol image sources after sanitizing', async () => {
		const html = await renderNoteHtml('![cat](asset://localhost/C%3A%2Fpics%2Fcat.png)');
		expect(html).toContain('src="asset://localhost/C%3A%2Fpics%2Fcat.png"');
	});

	it('strips scripts from the rendered markdown', async () => {
		const html = await renderNoteHtml('<script>alert(1)</script>\n\nHello');
		expect(html).not.toContain('<script>');
	});

	it('renders resolved wiki links and heading targets', async () => {
		const source = createNote({ id: 'source', title: 'Source', body: 'See [[Plan#Next step|the plan]] and ![[Plan]]', workspaceId: 'one' });
		const target = createNote({ id: 'target', title: 'Plan', body: '# Next step', workspaceId: 'one' });
		const html = await renderNoteHtml(source.body, { source, notes: [source, target] });
		expect(html).toContain('data-wiki-target="target"');
		expect(html).toContain('data-wiki-heading="next-step"');
		expect(html).toContain('>the plan</a>');
		expect(html).toContain('id="next-step"');
	});

	it('renders unresolved wiki links without unsafe attributes', async () => {
		const source = createNote({ id: 'source', title: 'Source', body: '[[<script>alert(1)</script>]]', workspaceId: 'one' });
		const html = await renderNoteHtml(source.body, { source, notes: [source] });
		expect(html).toContain('wiki-link-unresolved');
		expect(html).not.toContain('<script>');
	});

	it('renders embeds and stops recursive embed cycles', async () => {
		const source = createNote({ id: 'source', title: 'Source', body: '![[Target]]', workspaceId: 'one' });
		const target = createNote({ id: 'target', title: 'Target', body: 'Embedded text\n\n![[Source]]', workspaceId: 'one' });
		const html = await renderNoteHtml(source.body, { source, notes: [source, target] });
		expect(html).toContain('Embedded text');
		expect(html).toContain('wiki-embed-cycle');
	});

	it('keeps Mermaid fences as code for the preview renderer', async () => {
		const html = await renderNoteHtml('```mermaid\nflowchart LR\nA --> B\n```');
		expect(html).toContain('<pre><code class="language-mermaid">');
		expect(html).toContain('A --&gt; B');
	});

	it('renders editor-friendly Markdown syntax', async () => {
		const html = await renderNoteHtml(
			'first line\nsecond line\n\n~~removed~~\n\nhttps://example.com\n\n| Name | Value |\n| --- | --- |\n| note | text |',
		);

		expect(html).toContain('first line<br>\nsecond line');
		expect(html).toContain('<s>removed</s>');
		expect(html).toContain('<a href="https://example.com">https://example.com</a>');
		expect(html).toContain('<table>');
		expect(html).toContain('<td>note</td>');
	});

	it('renders interactive task checkboxes in Markdown order', async () => {
		const html = await renderNoteHtml('- [ ] first task\n  - [x] nested task\n- [ ] third task');
		const checkboxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
			([tag]) => tag,
		);

		expect(checkboxes).toHaveLength(3);
		expect(checkboxes[0]).not.toContain('checked');
		expect(checkboxes[1]).toContain('checked');
		expect(checkboxes[2]).not.toContain('checked');
		expect(html).not.toContain('disabled');
	});

	it('highlights code fences including less common languages', async () => {
		const typescript = await renderNoteHtml('```ts\nconst answer: number = 42;\n```');
		const haskell = await renderNoteHtml('```haskell\nmain = putStrLn "hello"\n```');

		expect(typescript).toContain('class="shiki');
		expect(typescript).toContain('class="language-ts"');
		expect(typescript).toContain('--shiki-dark:');
		expect(typescript).toContain('answer');
		expect(typescript).toContain('data-preview-action="copy-code"');
		expect(haskell).toContain('class="shiki');
		expect(haskell).toContain('class="language-haskell"');
		expect(haskell).toContain('putStrLn');
	}, 15000);

	it('renders inline and display math and keeps invalid expressions readable', async () => {
		const html = await renderNoteHtml(
			'Energy $E=mc^2$\n\n$$\n\\frac{1}{2}\n$$\n\nInvalid $\\notacommand$',
		);

		expect(html).toContain('class="katex"');
		expect(html).toContain('class="katex-display"');
		expect(html).toContain('notacommand');
	});
});

describe('escapeHtml', () => {
	it('escapes html-sensitive characters', () => {
		expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'
		);
	});

	it('leaves plain text untouched', () => {
		expect(escapeHtml('Hello world')).toBe('Hello world');
	});
});

describe('notePrintDocument', () => {
	it('includes the escaped title and rendered body', () => {
		const note = createNote({ title: 'A <B> & "C"', body: 'Body' });
		const doc = notePrintDocument(note, '<p>Body</p>');
		expect(doc).toContain('<title>A &lt;B&gt; &amp; &quot;C&quot;</title>');
		expect(doc).toContain('<h1>A &lt;B&gt; &amp; &quot;C&quot;</h1><p>Body</p>');
	});

	it('falls back to a default title when empty', () => {
		const note = createNote({ title: '' });
		expect(notePrintDocument(note, '')).toContain('<h1>Untitled note</h1>');
	});

	it('includes inline Mermaid SVG and stylesheets in the print document', () => {
		const note = createNote({ title: 'Diagram' });
		const svg = '<div class="mermaid-diagram"><svg><path d="M0 0" /></svg></div>';
		const doc = notePrintDocument(note, svg, ['https://app.test/katex.css']);
		expect(doc).toContain(svg);
		expect(doc).toContain('<link rel="stylesheet" href="https://app.test/katex.css">');
	});
});

describe('noteFileName', () => {
	it('appends the markdown extension', () => {
		expect(noteFileName(createNote({ title: 'Shopping list' }))).toBe('Shopping list.md');
	});

	it('strips characters invalid on windows', () => {
		expect(noteFileName(createNote({ title: 'a/b:c*d?' }))).toBe('a-b-c-d-.md');
	});

	it('falls back to note when the title is blank', () => {
		const blank = { ...createNote({}), title: '' };
		expect(noteFileName(blank)).toBe('note.md');
	});
});

describe('markdownBaseName', () => {
	it('keeps ordinary titles readable', () => {
		expect(markdownBaseName('Weekly review')).toBe('Weekly review');
	});

	it('strips leading dots so a title cannot create a hidden file', () => {
		expect(markdownBaseName('.draft')).toBe('draft');
		expect(markdownBaseName('..')).toBe('note');
	});

	it('trims surrounding whitespace', () => {
		expect(markdownBaseName('  meeting notes  ')).toBe('meeting notes');
	});
});