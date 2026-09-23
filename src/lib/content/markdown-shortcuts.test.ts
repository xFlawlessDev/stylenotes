import { describe, it, expect } from 'vitest';
import { shortcutCommand } from '$lib/content/markdown-shortcuts';

const key = (
	value: string,
	mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}
) => shortcutCommand({ key: value, ctrlKey: true, ...mods });

describe('shortcutCommand', () => {
	it('maps familiar inline shortcuts', () => {
		expect(key('b')).toBe('bold');
		expect(key('i')).toBe('italic');
		expect(key('e')).toBe('code');
		expect(key('k')).toBe('link');
	});

	it('maps shift shortcuts for blocks', () => {
		expect(key('x', { shiftKey: true })).toBe('strikethrough');
		expect(key('7', { shiftKey: true })).toBe('numbered');
		expect(key('8', { shiftKey: true })).toBe('bullet');
		expect(key('9', { shiftKey: true })).toBe('checklist');
		expect(key('.', { shiftKey: true })).toBe('quote');
		expect(key('c', { shiftKey: true })).toBe('codeblock');
		expect(key('k', { shiftKey: true })).toBe('wikilink');
	});

	it('maps alt shortcuts for headings', () => {
		expect(key('1', { altKey: true })).toBe('heading1');
		expect(key('3', { altKey: true })).toBe('heading3');
		expect(key('0', { altKey: true })).toBe('paragraph');
	});

	it('maps mod+enter to toggling a checkbox', () => {
		expect(key('Enter')).toBe('checked');
	});

	it('accepts meta as the modifier', () => {
		expect(shortcutCommand({ key: 'b', metaKey: true })).toBe('bold');
	});

	it('ignores unmodified keys', () => {
		expect(shortcutCommand({ key: 'b' })).toBeNull();
		expect(shortcutCommand({ key: 'Enter' })).toBeNull();
	});
});

describe('shifted layouts', () => {
	it('resolves shift+digit shortcuts from the physical key', () => {
		expect(shortcutCommand({ key: '&', code: 'Digit7', ctrlKey: true, shiftKey: true })).toBe(
			'numbered'
		);
		expect(shortcutCommand({ key: '(', code: 'Digit9', ctrlKey: true, shiftKey: true })).toBe(
			'checklist'
		);
	});

	it('resolves the quote shortcut from the period key', () => {
		expect(shortcutCommand({ key: '>', code: 'Period', ctrlKey: true, shiftKey: true })).toBe(
			'quote'
		);
	});
});
