import { describe, it, expect } from 'vitest';
import { transform } from '$lib/content/markdown-commands';
import type { EditState } from '$lib/content/markdown-editor';

const at = (value: string, start = value.length, end = start): EditState => ({
	value,
	start,
	end
});

describe('transform', () => {
	it('dispatches inline commands', () => {
		expect(transform(at('x', 0, 1), 'bold')?.value).toBe('**x**');
		expect(transform(at('x', 0, 1), 'code')?.value).toBe('`x`');
		expect(transform(at('x', 0, 1), 'wikilink')?.value).toBe('[[x]]');
		expect(transform(at('x', 0, 1), 'image')?.value).toBe('![x](https://)');
	});

	it('dispatches heading commands', () => {
		expect(transform(at('x'), 'heading1')?.value).toBe('# x');
		expect(transform(at('# x'), 'paragraph')?.value).toBe('x');
	});

	it('dispatches list commands', () => {
		expect(transform(at('x'), 'bullet')?.value).toBe('- x');
		expect(transform(at('x'), 'numbered')?.value).toBe('1. x');
		expect(transform(at('x'), 'checklist')?.value).toBe('- [ ] x');
		expect(transform(at('x'), 'quote')?.value).toBe('> x');
	});

	it('dispatches block commands', () => {
		expect(transform(at('x'), 'divider')?.value).toBe('x\n\n---');
		expect(transform(at('x'), 'codeblock')?.value).toBe('x\n\n```\n\n```');
	});

	it('returns null when a command does not apply', () => {
		expect(transform(at('plain'), 'checked')).toBeNull();
	});
});
