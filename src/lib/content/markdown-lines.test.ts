import { describe, it, expect } from 'vitest';
import {
	continueList,
	indentLines,
	stripHeading,
	toggleBulletList,
	toggleChecked,
	toggleChecklist,
	toggleHeading,
	toggleNumberedList,
	toggleQuote
} from '$lib/content/markdown-lines';
import type { EditState } from '$lib/content/markdown-editor';

const at = (value: string, start = value.length, end = start): EditState => ({
	value,
	start,
	end
});

describe('toggleHeading', () => {
	it('adds a heading marker', () => {
		expect(toggleHeading(at('intro'), 2).value).toBe('## intro');
	});

	it('switches heading level', () => {
		expect(toggleHeading(at('# intro'), 3).value).toBe('### intro');
	});

	it('removes the marker when the level matches', () => {
		expect(toggleHeading(at('## intro'), 2).value).toBe('intro');
	});

	it('strips any heading marker for paragraph', () => {
		expect(stripHeading(at('#### intro')).value).toBe('intro');
		expect(stripHeading(at('plain')).value).toBe('plain');
	});
});

describe('toggleBulletList', () => {
	it('adds a bullet to the current line', () => {
		expect(toggleBulletList(at('one')).value).toBe('- one');
	});

	it('removes the bullet when already a list', () => {
		expect(toggleBulletList(at('- one')).value).toBe('one');
	});

	it('converts a checklist item to a bullet', () => {
		expect(toggleBulletList(at('- [x] task')).value).toBe('- task');
	});

	it('skips empty lines in multi-line selections', () => {
		expect(toggleBulletList(at('a\n\nb', 0, 4)).value).toBe('- a\n\n- b');
	});
});

describe('toggleNumberedList', () => {
	it('numbers every selected line', () => {
		expect(toggleNumberedList(at('a\nb\nc', 0, 5)).value).toBe('1. a\n2. b\n3. c');
	});

	it('removes numbering when every line is ordered', () => {
		expect(toggleNumberedList(at('1. a\n2. b', 0, 8)).value).toBe('a\nb');
	});
});

describe('toggleChecklist', () => {
	it('converts a plain line into an unchecked task', () => {
		expect(toggleChecklist(at('task')).value).toBe('- [ ] task');
	});

	it('converts a bullet into a task', () => {
		expect(toggleChecklist(at('- task')).value).toBe('- [ ] task');
	});

	it('removes the task marker when already a checklist', () => {
		expect(toggleChecklist(at('- [x] task')).value).toBe('task');
	});
});

describe('toggleChecked', () => {
	it('flips every checkbox state', () => {
		expect(toggleChecked(at('- [ ] a\n- [x] b', 0, 14))?.value).toBe('- [x] a\n- [ ] b');
	});

	it('returns null when no task is present', () => {
		expect(toggleChecked(at('plain text'))).toBeNull();
	});
});

describe('toggleQuote', () => {
	it('quotes the current line', () => {
		expect(toggleQuote(at('note')).value).toBe('> note');
	});

	it('unquotes when every line is quoted', () => {
		expect(toggleQuote(at('> note')).value).toBe('note');
	});
});

describe('continueList', () => {
	it('starts a new unchecked task', () => {
		const next = continueList(at('- [ ] first'));
		expect(next?.value).toBe('- [ ] first\n- [ ] ');
		expect(next?.start).toBe(next?.value.length);
	});

	it('leaves the checklist when the item is empty', () => {
		expect(continueList(at('- [ ] '))?.value).toBe('');
	});

	it('continues a bullet list', () => {
		expect(continueList(at('- first'))?.value).toBe('- first\n- ');
	});

	it('leaves the bullet list when the item is empty', () => {
		expect(continueList(at('- '))?.value).toBe('');
	});

	it('increments the next ordered number', () => {
		expect(continueList(at('3. third'))?.value).toBe('3. third\n4. ');
	});

	it('continues a quote', () => {
		expect(continueList(at('> quote'))?.value).toBe('> quote\n> ');
	});

	it('ignores plain paragraphs and selections', () => {
		expect(continueList(at('paragraph'))).toBeNull();
		expect(continueList(at('- item', 0, 6))).toBeNull();
	});
});

describe('indentLines', () => {
	it('indents list lines by two spaces', () => {
		expect(indentLines(at('- a\n- b', 0, 7), false)?.value).toBe('  - a\n  - b');
	});

	it('outdents list lines', () => {
		expect(indentLines(at('  - a'), true)?.value).toBe('- a');
	});

	it('ignores paragraphs', () => {
		expect(indentLines(at('plain'), false)).toBeNull();
	});
});
