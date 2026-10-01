import { describe, expect, it } from 'vitest';
import { formatToolResult } from '$lib/content/ai-tool-format';

/** Mirrors the formatter's own rule for what deserves a block of its own. */
const LONG = 'x'.repeat(200);

describe('formatToolResult', () => {
	it('states a failure up front so it cannot read as data', () => {
		expect(formatToolResult({ ok: false, error: 'No note with id `w1/nope`.' })).toBe(
			'ERROR: No note with id `w1/nope`.'
		);
	});

	it('renders a plain string answer as-is', () => {
		expect(formatToolResult({ ok: true, data: 'done' })).toBe('done');
	});

	it('keeps prose readable instead of quote-escaping it', () => {
		const rendered = formatToolResult({
			ok: true,
			data: { body: '# Roadmap\n\nIt says "yes" here.' }
		});
		expect(rendered).toBe('body:\n  # Roadmap\n  \n  It says "yes" here.');
	});

	it('renders scalar fields as `key: value` lines', () => {
		expect(formatToolResult({ ok: true, data: { total: 3, at: 'now' } })).toBe(
			'total: 3\nat: now'
		);
	});

	it('keeps a flat list entry on a single line', () => {
		const data = { notes: [{ ref: 'w1/n1', title: 'Roadmap', folder: 'work' }] };
		expect(formatToolResult({ ok: true, data })).toBe(
			'notes:\n  - ref: w1/n1 · title: Roadmap · folder: work'
		);
	});

	it('falls back to a block when a list entry carries a long string', () => {
		const data = { notes: [{ title: 'Roadmap', body: LONG }] };
		expect(formatToolResult({ ok: true, data })).toBe(
			`notes:\n  - title: Roadmap\n    body:\n      ${LONG}`
		);
	});

	it('keeps only the first line of a bullet carrying multi-line text', () => {
		expect(formatToolResult({ ok: true, data: ['first\nsecond'] })).toBe('- first\n  second');
	});

	it('marks empty containers instead of emitting a blank message', () => {
		expect(formatToolResult({ ok: true, data: { notes: [] } })).toBe('notes: []');
		expect(formatToolResult({ ok: true, data: '' })).toBe('(no content)');
	});

	it('renders null and undefined as `null`', () => {
		expect(formatToolResult({ ok: true, data: { at: null, end: undefined } })).toBe(
			'at: null\nend: null'
		);
	});

	it('nests indentation under the key that owns it', () => {
		const data = { hit: { score: 0.9, tags: ['a', 'b'] } };
		expect(formatToolResult({ ok: true, data })).toBe(
			'hit:\n  score: 0.9\n  tags:\n    - a\n    - b'
		);
	});
});
