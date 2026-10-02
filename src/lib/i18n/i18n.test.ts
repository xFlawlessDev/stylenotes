import { describe, it, expect } from 'vitest';
import {
	bundleFor,
	interpolate,
	isLocale,
	localeTag,
	lookup,
	LOCALES,
	translate,
	DEFAULT_LOCALE,
} from '$lib/i18n/catalog';
import { en } from '$lib/i18n/locales/en';
import { id } from '$lib/i18n/locales/id';

describe('catalog', () => {
	it('ships the documented locales and a matching default', () => {
		expect(LOCALES.map((entry) => entry.id)).toEqual(['en', 'id']);
		expect(DEFAULT_LOCALE).toBe('en');
	});

	it('recognises only shipped locale codes', () => {
		expect(isLocale('en')).toBe(true);
		expect(isLocale('id')).toBe(true);
		expect(isLocale('fr')).toBe(false);
		expect(isLocale(null)).toBe(false);
		expect(isLocale(3)).toBe(false);
	});
});

describe('lookup', () => {
	it('resolves a dotted path to its leaf string', () => {
		expect(lookup(en, 'settings.title')).toBe('Settings');
		expect(lookup(en, 'ai.toolStatus.done')).toBe('Done');
	});

	it('marks an unknown key instead of returning undefined', () => {
		expect(lookup(en, 'settings.nope')).toBe('<settings.nope>');
		expect(lookup(en, 'ai.toolStatus.done.deeper')).toBe('<ai.toolStatus.done.deeper>');
	});

	it('does not fall through to a parent object', () => {
		// `settings.editor` is an object, not a string: a caller that forgot the
		// last segment must see it rather than rendering "[object Object]".
		expect(lookup(en, 'settings.editor')).toBe('<settings.editor>');
	});
});

describe('interpolate', () => {
	it('swaps named placeholders', () => {
		expect(interpolate('{count} notes stored', { count: 4 })).toBe('4 notes stored');
	});

	it('stringifies numbers and keeps repeated placeholders', () => {
		expect(interpolate('{a} then {a}', { a: 2 })).toBe('2 then 2');
	});

	it('leaves a missing placeholder visible, never "undefined"', () => {
		expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
		expect(interpolate('{a}')).toBe('{a}');
	});

	it('returns the template untouched without params', () => {
		expect(interpolate('plain')).toBe('plain');
	});
});

describe('translate', () => {
	it('reads from the requested locale', () => {
		expect(translate('en', 'settings.title')).toBe('Settings');
		expect(translate('id', 'settings.title')).toBe('Pengaturan');
	});

	it('interpolates params', () => {
		expect(translate('en', 'settings.data.notesStored', { count: 3 })).toBe('3 notes stored');
		expect(translate('id', 'settings.data.notesStored', { count: 3 })).toBe('3 catatan tersimpan');
	});

	it('falls back to the default locale for an unknown code', () => {
		expect(translate('fr' as never, 'settings.title')).toBe('Settings');
	});

	it('marks an unknown key in both locales', () => {
		expect(translate('en', 'nope')).toBe('<nope>');
		expect(translate('id', 'nope')).toBe('<nope>');
	});
});

describe('localeTag', () => {
	it('maps to a BCP-47 tag for Intl formatting', () => {
		expect(localeTag('en')).toBe('en-US');
		expect(localeTag('id')).toBe('id-ID');
	});
});

describe('translation completeness', () => {
	/** Every dotted leaf path in a bundle, so the two trees can be compared. */
	function leafPaths(tree: unknown, prefix = ''): string[] {
		if (typeof tree === 'string') return [prefix];
		if (!tree || typeof tree !== 'object') return [];
		return Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) =>
			leafPaths(value, prefix ? `${prefix}.${key}` : key)
		);
	}

	it('translates every English key into Indonesian', () => {
		// Shape equality is enforced by TypeScript at build time; this catches a
		// bundle that was widened with an index signature or assembled loosely.
		expect(leafPaths(id)).toEqual(leafPaths(en));
	});

	it('only leaves loanwords and product names identical between locales', () => {
		// Indonesian keeps many of these as-is (Editor, Kanban, MCP, serif…), and
		// the rest are proper nouns. An entry here that is not on the list means a
		// translator copied the English string instead of translating it.
		const allowed = new Set([
			'Edit', 'Folder', 'StyleNotes', 'Edit folder', 'Tag', '+ Tag', 'Status',
			'Kanban', 'Gantt', 'Manual', 'Editor', 'Overlay', 'AI', 'MCP', 'Data',
			'Cloud',
			'Sage', 'Rose', 'Model', 'Embedder', 'Edit {name}', 'System UI', 'Serif', 'Monospace',
			'Diagram', 'Tunnel', 'Endpoint', 'Token', 'Video', 'Audio', 'PDF',
			'Vault', 'Backlog',
		]);
		const identical = leafPaths(en).filter((path) => lookup(en, path) === lookup(id, path));
		const unexpected = identical
			.map((path) => lookup(en, path))
			.filter((value) => !allowed.has(value));
		expect(unexpected, 'Indonesian is identical to English for these strings').toEqual([]);
	});

	it('has no empty translations', () => {
		for (const path of leafPaths(en)) {
			expect(lookup(en, path).length, `en.${path}`).toBeGreaterThan(0);
			expect(lookup(id, path).length, `id.${path}`).toBeGreaterThan(0);
		}
	});

	it('keeps placeholders in step between the two locales', () => {
		const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();
		for (const path of leafPaths(en)) {
			expect(placeholders(lookup(id, path)), `id.${path}`).toEqual(
				placeholders(lookup(en, path))
			);
		}
	});
});

describe('bundleFor', () => {
	it('returns the requested bundle and defaults on an unknown code', () => {
		expect(bundleFor('id')).toBe(id);
		expect(bundleFor('nope' as never)).toBe(en);
	});
});
