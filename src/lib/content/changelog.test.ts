import { describe, expect, it } from 'vitest';
import { changelog, cleanItem, parseChangelog, releasedChangelog } from '$lib/content/changelog';

describe('cleanItem', () => {
	it('drops the commit/issue link group the release tool appends', () => {
		const line =
			'add a new thing ([a4d4dbd](https://github.com/x/y/commit/a4d4dbd10cf69b5a5e2391f861143a561df86cbc))';
		expect(cleanItem(line)).toBe('add a new thing');
	});

	it('keeps a link label and discards the target', () => {
		expect(cleanItem('references [#D1](https://github.com/x/y/issues/D1)')).toBe(
			'references #D1'
		);
	});

	it('strips code and emphasis markers and collapses whitespace', () => {
		expect(cleanItem('**bold** and `code`   spaced')).toBe('bold and code spaced');
	});
});

describe('parseChangelog', () => {
	it('reads a plain version heading with a date', () => {
		const entries = parseChangelog('## 0.1.0 (2026-10-02)\n\n### Features\n\n* first\n');
		expect(entries).toHaveLength(1);
		expect(entries[0].version).toBe('0.1.0');
		expect(entries[0].date).toBe('2026-10-02');
		expect(entries[0].sections[0]).toEqual({ title: 'Features', items: ['first'] });
	});

	it('reads a linked version heading', () => {
		const entries = parseChangelog('## [1.2.3](https://x/compare/a...b) (2026-04-02)\n');
		expect(entries[0].version).toBe('1.2.3');
		expect(entries[0].date).toBe('2026-04-02');
	});

	it('marks the Unreleased block', () => {
		const entries = parseChangelog('## [Unreleased]\n\n### Added\n\n- wip\n');
		expect(entries[0].unreleased).toBe(true);
		expect(entries[0].version).toBe('Unreleased');
	});

	it('joins a wrapped continuation line onto its bullet', () => {
		const raw = [
			'## 1.0.0 (2026-01-01)',
			'',
			'### Added',
			'',
			'- a long item that',
			'  wraps onto the next line',
			'',
			'- a second item'
		].join('\n');
		const section = parseChangelog(raw)[0].sections[0];
		expect(section.items).toEqual(['a long item that wraps onto the next line', 'a second item']);
	});

	it('keeps multiple sections in order', () => {
		const raw = [
			'## 1.0.0 (2026-01-01)',
			'',
			'### Features',
			'',
			'- f1',
			'',
			'### Bug Fixes',
			'',
			'- b1'
		].join('\n');
		expect(parseChangelog(raw)[0].sections.map((s) => s.title)).toEqual([
			'Features',
			'Bug Fixes'
		]);
	});

	it('ignores content before the first version heading', () => {
		expect(parseChangelog('# Changelog\n\nintro text\n').find(() => true)).toBeUndefined();
	});
});

describe('bundled changelog', () => {
	it('parses the repository file into released entries', () => {
		expect(changelog.length).toBeGreaterThan(0);
		expect(releasedChangelog.length).toBeGreaterThan(0);
		expect(releasedChangelog.every((entry) => !entry.unreleased)).toBe(true);
		expect(releasedChangelog[0].version).toMatch(/^\d+\.\d+\.\d+/);
	});
});
