import { describe, it, expect } from 'vitest';
import {
	escapeHtml,
	noteFileName,
	notePrintDocument,
	renderNoteHtml,
} from '$lib/content/note-actions';
import { createNote } from '$lib/content/content';

describe('renderNoteHtml', () => {
	it('keeps asset protocol image sources after sanitizing', () => {
		const html = renderNoteHtml('![cat](asset://localhost/C%3A%2Fpics%2Fcat.png)');
		expect(html).toContain('src="asset://localhost/C%3A%2Fpics%2Fcat.png"');
	});

	it('strips scripts from the rendered markdown', () => {
		const html = renderNoteHtml('<script>alert(1)</script>\n\nHello');
		expect(html).not.toContain('<script>');
	});
});

describe('escapeHtml', () => {
	it('escapes html-sensitive characters', () => {
		expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'
		);
	});

	it('leaves plain text untouched', () => {
		expect(escapeHtml('Hello world')).toBe('Hello world');
	});
});

describe('notePrintDocument', () => {
	it('includes the escaped title and rendered body', () => {
		const note = createNote({ title: 'A <B> & "C"', body: 'Body' });
		const doc = notePrintDocument(note, '<p>Body</p>');
		expect(doc).toContain('<title>A &lt;B&gt; &amp; &quot;C&quot;</title>');
		expect(doc).toContain('<h1>A &lt;B&gt; &amp; &quot;C&quot;</h1><p>Body</p>');
	});

	it('falls back to a default title when empty', () => {
		const note = createNote({ title: '' });
		expect(notePrintDocument(note, '')).toContain('<h1>Untitled note</h1>');
	});
});

describe('noteFileName', () => {
	it('appends the markdown extension', () => {
		expect(noteFileName(createNote({ title: 'Shopping list' }))).toBe('Shopping list.md');
	});

	it('strips characters invalid on windows', () => {
		expect(noteFileName(createNote({ title: 'a/b:c*d?' }))).toBe('a-b-c-d-.md');
	});

	it('falls back to note when the title is blank', () => {
		const blank = { ...createNote({}), title: '' };
		expect(noteFileName(blank)).toBe('note.md');
	});
});