import { describe, expect, it } from 'vitest';
import {
	applyInsert,
	applyReplace,
	countOccurrences,
	isInsertPosition,
	isOccurrence
} from '$lib/content/mcp-body-edit';

describe('countOccurrences', () => {
	it('counts non-overlapping hits', () => {
		expect(countOccurrences('alnair and alnair', 'alnair')).toBe(2);
		expect(countOccurrences('aaa', 'aa')).toBe(1);
		expect(countOccurrences('nothing here', 'zzz')).toBe(0);
	});

	it('treats an empty needle as no match', () => {
		expect(countOccurrences('abc', '')).toBe(0);
	});
});

describe('applyReplace', () => {
	it('replaces every occurrence by default', () => {
		const result = applyReplace('alnair ships alnair', 'alnair', 'stylenotes', 'all');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.body).toBe('stylenotes ships stylenotes');
			expect(result.matched).toBe(2);
			expect(result.replaced).toBe(2);
		}
	});

	it('replaces a unique occurrence with once', () => {
		const result = applyReplace('# Title\n\nbody', '# Title', '# Renamed', 'once');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('# Renamed\n\nbody');
	});

	it('refuses a needle that is not there, instead of reporting success', () => {
		const result = applyReplace('hello', 'goodbye', 'x', 'all');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	it('refuses an empty needle rather than inserting between every character', () => {
		const result = applyReplace('abc', '', '-', 'all');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});

	it('refuses an ambiguous once instead of guessing the first hit', () => {
		const result = applyReplace('alnair / alnair', 'alnair', 'stylenotes', 'once');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('bad_arguments');
			// The message must tell the model how to fix it.
			expect(result.message).toContain('occurrence: "all"');
		}
	});

	it('allows once with enough surrounding context', () => {
		const body = '## alnair\n\nnote about alnair';
		const result = applyReplace(body, '## alnair', '## stylenotes', 'once');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('## stylenotes\n\nnote about alnair');
	});

	it('can delete text by replacing with an empty string', () => {
		const result = applyReplace('keep DROP keep', ' DROP', '', 'all');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('keep keep');
	});

	it('is safe when the replacement contains the needle', () => {
		// A naive loop over indexOf would spin forever here; split/join cannot.
		const result = applyReplace('a', 'a', 'aa', 'all');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('aa');
	});
});

describe('applyInsert', () => {
	it('appends with exactly one separator newline', () => {
		const result = applyInsert('first', 'second', 'end');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('first\n\nsecond');
	});

	it('does not double a trailing newline', () => {
		const result = applyInsert('first\n\n\n', 'second', 'end');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('first\n\nsecond');
	});

	it('appends to an empty body without a leading blank line', () => {
		const result = applyInsert('', '- diary entry', 'end');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('- diary entry');
	});

	it('prepends without a trailing blank line on an empty body', () => {
		const result = applyInsert('', 'Header', 'start');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('Header');
	});

	it('prepends above existing content', () => {
		const result = applyInsert('body', 'Header', 'start');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.body).toBe('Header\n\nbody');
	});

	it('refuses empty text', () => {
		const result = applyInsert('body', '', 'end');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe('bad_arguments');
	});
});

describe('validators', () => {
	it('accepts only the closed sets', () => {
		expect(isOccurrence('once')).toBe(true);
		expect(isOccurrence('all')).toBe(true);
		expect(isOccurrence('first')).toBe(false);
		expect(isOccurrence(undefined)).toBe(false);

		expect(isInsertPosition('start')).toBe(true);
		expect(isInsertPosition('end')).toBe(true);
		expect(isInsertPosition('middle')).toBe(false);
	});
});
