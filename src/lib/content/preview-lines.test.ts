import { describe, expect, it } from 'vitest';
import {
	annotatePreviewLines,
	isEditablePreviewClick,
	previewLineBlockFromTarget,
	sourceLineBlocks
} from '$lib/content/preview-lines';
import { renderNoteHtml } from '$lib/content/note-actions';

describe('sourceLineBlocks', () => {
	it('maps headings, paragraphs and lists to their source lines', () => {
		const blocks = sourceLineBlocks('# Title\n\nParagraph\nmore\n\n- a\n- b');
		expect(blocks).toEqual([
			{ start: 0, end: 1, editable: true },
			{ start: 2, end: 4, editable: true },
			{ start: 5, end: 7, editable: true }
		]);
	});

	it('maps a whole table as one block', () => {
		expect(sourceLineBlocks('| a |\n| --- |\n| b |')).toEqual([
			{ start: 0, end: 3, editable: true }
		]);
	});

	it('marks a fenced code block non-editable at the fence line', () => {
		expect(sourceLineBlocks('```js\ncode\n```')).toEqual([{ start: 0, end: 3, editable: false }]);
	});
});

describe('annotatePreviewLines', () => {
	it('tags each top-level block with its source line range', () => {
		const source = '# Title\n\nBody';
		const html = '<h1 id="title">Title</h1>\n<p>Body</p>\n';
		const tagged = annotatePreviewLines(html, source);
		expect(tagged).toContain('<h1 id="title" data-line-block="0:1">');
		expect(tagged).toContain('<p data-line-block="2:3">');
	});

	it('does not tag blocks whose source line is not editable (fences)', () => {
		const tagged = annotatePreviewLines('<pre><code>code</code></pre>\n', '```js\ncode\n```');
		expect(tagged).not.toContain('data-line-block');
	});

	it('leaves documents untouched when there are no source blocks', () => {
		expect(annotatePreviewLines('<hr>', '')).toBe('<hr>');
	});
});

describe('previewLineBlockFromTarget', () => {
	it('returns the block wrapping the click', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p data-line-block="2:4"><strong>Body</strong></p>';
		expect(previewLineBlockFromTarget(root.querySelector('strong'), root)).toEqual({
			start: 2,
			end: 4,
			editable: true
		});
	});

	it('ignores clicks outside a tagged block', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>Body</p>';
		expect(previewLineBlockFromTarget(root.querySelector('p'), root)).toBeNull();
	});
});

describe('isEditablePreviewClick', () => {
	it('accepts plain text but not interactive elements', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<p data-line-block="0:1"><span>text</span><a href="#">link</a><input type="checkbox"><button>copy</button></p>';
		expect(isEditablePreviewClick(root.querySelector('span'), root)).toBe(true);
		expect(isEditablePreviewClick(root.querySelector('a'), root)).toBe(false);
		expect(isEditablePreviewClick(root.querySelector('input'), root)).toBe(false);
		expect(isEditablePreviewClick(root.querySelector('button'), root)).toBe(false);
	});
});

describe('annotatePreviewLines against real rendering', () => {
	it('lines up every rendered block with its source line range', async () => {
		const source = [
			'# Title',
			'',
			'Paragraph one',
			'still the same paragraph',
			'',
			'- alpha',
			'- beta',
			'',
			'> quoted line',
			'',
			'```js',
			'const x = 1;',
			'```',
			'',
			'Final paragraph'
		].join('\n');

		const rendered = await renderNoteHtml(source);
		const tagged = annotatePreviewLines(rendered, source);
		const root = document.createElement('div');
		root.innerHTML = tagged;

		const taggedBlocks = Array.from(root.querySelectorAll<HTMLElement>('[data-line-block]')).map(
			(element) => ({
				tag: element.tagName.toLowerCase(),
				range: element.dataset.lineBlock
			})
		);

		// The fence block carries no editor, so it must not be tagged.
		expect(taggedBlocks).toEqual([
			{ tag: 'h1', range: '0:1' },
			{ tag: 'p', range: '2:4' },
			{ tag: 'ul', range: '5:8' },
			{ tag: 'blockquote', range: '8:9' },
			{ tag: 'p', range: '14:15' }
		]);

		// Each tagged range must resolve back to the exact source lines.
		const lines = source.split('\n');
		for (const { range } of taggedBlocks) {
			const [start, end] = range!.split(':').map(Number);
			expect(lines[start].trim().length).toBeGreaterThan(0);
			expect(end).toBeGreaterThan(start);
		}
	});
});
