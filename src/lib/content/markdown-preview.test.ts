import { describe, it, expect } from 'vitest';
import {
	clickedCheckboxIndex,
	enableTaskCheckboxes,
	preserveBlankLines
} from '$lib/content/markdown-preview';

describe('preserveBlankLines', () => {
	it('keeps single newlines untouched', () => {
		expect(preserveBlankLines('a\nb')).toBe('a\nb');
	});

	it('keeps one blank line as a paragraph break', () => {
		expect(preserveBlankLines('a\n\nb')).toBe('a\n\nb');
	});

	it('turns extra blank lines into explicit breaks', () => {
		expect(preserveBlankLines('a\n\n\nb')).toBe('a\n\n<br>\n\nb');
		expect(preserveBlankLines('a\n\n\n\nb')).toBe('a\n\n<br>\n\n<br>\n\nb');
	});

	it('preserves trailing blank lines', () => {
		expect(preserveBlankLines('a\n\n\n')).toBe('a\n\n<br>\n\n<br>\n');
	});

	it('leaves fenced code blocks untouched', () => {
		const code = '```\na\n\n\nb\n```';
		expect(preserveBlankLines(code)).toBe(code);
	});

	it('leaves indented code blocks untouched', () => {
		const code = '    a\n\n\n    b';
		expect(preserveBlankLines(code)).toBe(code);
	});
});

describe('enableTaskCheckboxes', () => {
	it('removes the disabled attribute from task inputs only', () => {
		const markup =
			'<input disabled="" type="checkbox"> a <input disabled type="text"><input checked="" disabled="" type="checkbox">';
		const next = enableTaskCheckboxes(markup);
		expect(next).toBe('<input type="checkbox"> a <input disabled type="text"><input checked="" type="checkbox">');
	});

	it('leaves markup without task inputs untouched', () => {
		const markup = '<p>plain</p><input disabled="" type="text">';
		expect(enableTaskCheckboxes(markup)).toBe(markup);
	});
});

describe('clickedCheckboxIndex', () => {
	it('returns the position of the clicked checkbox', () => {
		const root = document.createElement('div');
		root.innerHTML =
			'<ul><li><input type="checkbox"> a</li><li><input type="checkbox"> b</li></ul>';
		const inputs = root.querySelectorAll('input');
		expect(clickedCheckboxIndex(root, inputs[1])).toBe(1);
	});

	it('returns -1 for clicks outside a checkbox', () => {
		const root = document.createElement('div');
		root.innerHTML = '<p>text</p>';
		expect(clickedCheckboxIndex(root, root.querySelector('p'))).toBe(-1);
	});
});
