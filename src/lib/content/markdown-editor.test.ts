import { describe, it, expect } from 'vitest';
import {
	insertBlock,
	insertTable,
	wrapCodeBlock,
	wrapInline,
	type EditState
} from '$lib/content/markdown-editor';

const at = (value: string, start = value.length, end = start): EditState => ({
	value,
	start,
	end
});

describe('wrapInline', () => {
	it('wraps the selection with the marker', () => {
		expect(wrapInline(at('bold', 0, 4), '**')).toEqual({
			value: '**bold**',
			start: 2,
			end: 6
		});
	});

	it('inserts a selected placeholder when collapsed', () => {
		expect(wrapInline(at('hello'), '**')).toEqual({
			value: 'hello**text**',
			start: 7,
			end: 11
		});
	});

	it('removes markers around the selection', () => {
		expect(wrapInline(at('**bold**', 2, 6), '**')).toEqual({
			value: 'bold',
			start: 0,
			end: 4
		});
	});

	it('removes markers included in the selection', () => {
		expect(wrapInline(at('**bold**', 0, 8), '**')).toEqual({
			value: 'bold',
			start: 0,
			end: 4
		});
	});
});

describe('block inserts', () => {
	it('inserts a divider with surrounding blank lines', () => {
		expect(insertBlock(at('hello'), '---').value).toBe('hello\n\n---');
	});

	it('adds a blank line before a block after a single newline', () => {
		expect(insertBlock(at('hello\n'), '---').value).toBe('hello\n\n---');
	});

	it('inserts a table template with the caret in the first cell', () => {
		const next = insertTable(at(''));
		expect(next.value).toContain('| Column 1 | Column 2 |');
		expect(next.value).toContain('| --- | --- |');
		expect(next.start).toBe(2);
	});

	it('wraps the selection in a fenced code block', () => {
		expect(wrapCodeBlock(at('code', 0, 4))).toEqual({
			value: '```\ncode\n```',
			start: 4,
			end: 8
		});
	});

	it('leaves the caret inside an empty code block', () => {
		expect(wrapCodeBlock(at('', 0, 0))).toEqual({
			value: '```\n\n```',
			start: 4,
			end: 4
		});
	});
});
