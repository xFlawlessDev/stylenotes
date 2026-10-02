import { describe, expect, it } from 'vitest';
import {
	parseVaultNote,
	renderVaultNote,
	vaultFolderSegment,
	vaultRelPath,
	vaultSegment,
	VAULT_DEFAULT_FOLDER
} from '$lib/content/vault-format';
import { planExport, attachmentRelPath } from '$lib/content/vault-plan';
import { createNote } from '$lib/content/content';

describe('vaultSegment', () => {
	it('strips characters no filesystem accepts', () => {
		expect(vaultSegment('a/b:c*d?')).toBe('a-b-c-d-');
	});

	it('defends against Windows reserved device names', () => {
		expect(vaultSegment('con')).toBe('con-note');
		expect(vaultSegment('COM1')).toBe('COM1-note');
		expect(vaultSegment('lpt3')).toBe('lpt3-note');
	});

	it('drops a trailing dot or space Windows would silently strip', () => {
		expect(vaultSegment('Meeting notes.')).toBe('Meeting notes');
		expect(vaultSegment('Meeting notes ')).toBe('Meeting notes');
	});

	it('normalises to NFC so macOS and Windows agree', () => {
		const nfd = 'cafe\u0301'; // e + combining acute
		const nfc = 'caf\u00e9';
		expect(vaultSegment(nfd)).toBe(vaultSegment(nfc));
	});

	it('falls back to a usable name when everything is stripped', () => {
		expect(vaultSegment('...')).toBe('note');
		expect(vaultSegment('')).toBe('note');
	});
});

describe('vaultFolderSegment', () => {
	it('slugs a folder label', () => {
		expect(vaultFolderSegment('Graph Ideas')).toBe('graph-ideas');
	});

	it('never shadows the attachment store folder', () => {
		expect(vaultFolderSegment('attachments')).toBe('attachments-notes');
	});

	it('falls back for an empty folder', () => {
		expect(vaultFolderSegment('')).toBe('folder');
	});
});

describe('vaultRelPath', () => {
	it('joins a folder and a safe title', () => {
		expect(vaultRelPath('ideas', 'Graph RAG')).toBe('ideas/Graph RAG.md');
	});
});

describe('renderVaultNote', () => {
	const note = createNote({
		id: 'note-1',
		title: 'Roadmap',
		folder: 'projects',
		tags: ['q4', 'plan'],
		body: '# Roadmap\n\nBody here.',
		updatedAt: 1_700_000_000_000
	});

	it('writes a stable frontmatter block above the untouched body', () => {
		const rendered = renderVaultNote(note);
		expect(rendered).toContain('id: note-1');
		expect(rendered).toContain('title: Roadmap');
		expect(rendered).toContain('folder: projects');
		expect(rendered).toContain('tags: [q4, plan]');
		expect(rendered).toContain('updated_at: 1700000000000');
		expect(rendered.endsWith('# Roadmap\n\nBody here.')).toBe(true);
	});

	it('omits the id in folder mode so a foreign folder stays untouched', () => {
		const rendered = renderVaultNote(note, { writeId: false });
		expect(rendered).not.toContain('id:');
		expect(rendered).toContain('title: Roadmap');
	});

	it('round-trips through parseVaultNote', () => {
		const parsed = parseVaultNote('projects/Roadmap.md', renderVaultNote(note));
		expect(parsed.id).toBe('note-1');
		expect(parsed.title).toBe('Roadmap');
		expect(parsed.folder).toBe('projects');
		expect(parsed.tags).toEqual(['q4', 'plan']);
		expect(parsed.updatedAt).toBe(1_700_000_000_000);
		expect(parsed.body).toContain('Body here.');
	});
});

describe('parseVaultNote', () => {
	it('reads a foreign file with no frontmatter from its heading', () => {
		const parsed = parseVaultNote('Ideas/Idea.md', '# My Idea\n\ntext');
		expect(parsed.title).toBe('My Idea');
		expect(parsed.folder).toBe('Ideas');
		expect(parsed.tags).toEqual([]);
		// No id yet: the app assigns one on import (#V4).
		expect(parsed.id).toBeUndefined();
	});

	it('falls back to the file name and inbox at the root', () => {
		const parsed = parseVaultNote('Loose.md', 'plain');
		expect(parsed.title).toBe('Loose');
		expect(parsed.folder).toBe(VAULT_DEFAULT_FOLDER);
	});
});

describe('planExport', () => {
	it('gives a colliding title a numeric suffix', () => {
		const notes = [
			createNote({ id: 'a', title: 'Note', folder: 'ideas', body: 'one' }),
			createNote({ id: 'b', title: 'Note', folder: 'ideas', body: 'two' })
		];
		const plan = planExport(notes);
		const paths = plan.files.map((file) => file.relPath).sort();
		expect(paths).toEqual(['ideas/Note-2.md', 'ideas/Note.md']);
	});

	it('collects the attachment references the notes use', () => {
		const note = createNote({
			id: 'a',
			title: 'Pic',
			folder: 'ideas',
			body: '![x](stylenotes-attachment://ab12cd.png)'
		});
		const plan = planExport([note]);
		expect(plan.references).toEqual(['stylenotes-attachment://ab12cd.png']);
	});

	it('is deterministic across runs', () => {
		const notes = [
			createNote({ id: 'b', title: 'Beta', folder: 'ideas' }),
			createNote({ id: 'a', title: 'Alpha', folder: 'ideas' })
		];
		const first = planExport(notes).files.map((file) => file.relPath);
		const second = planExport([...notes].reverse()).files.map((file) => file.relPath);
		expect(first).toEqual(second);
	});
});

describe('attachmentRelPath', () => {
	it('maps a reference to the store layout', () => {
		expect(attachmentRelPath('stylenotes-attachment://ab12cd.png')).toBe(
			'attachments/ab/ab12cd.png'
		);
	});

	it('handles a reference with no extension', () => {
		expect(attachmentRelPath('stylenotes-attachment://deadbeef')).toBe(
			'attachments/de/deadbeef'
		);
	});

	it('returns null for a non-store target', () => {
		expect(attachmentRelPath('https://example.com/a.png')).toBeNull();
	});
});
