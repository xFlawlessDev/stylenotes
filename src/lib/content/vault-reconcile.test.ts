import { describe, expect, it } from 'vitest';
import {
	hasConflictMarkers,
	isAttachmentPath,
	isConflictedCopy,
	planSync
} from '$lib/content/vault-reconcile';
import { renderVaultNote } from '$lib/content/vault-format';
import type { VaultFile, VaultLink } from '$lib/db/vault';
import { createNote, type Note } from '$lib/content/content';

function file(relPath: string, content: string, hash = `hash:${content}`): VaultFile {
	return { relPath, content, contentHash: hash, mtime: 0 };
}

function link(relPath: string, entityId: string | null, contentHash = 'old'): VaultLink {
	return {
		workspaceId: 'w',
		relPath,
		entityKind: 'note',
		entityId,
		contentHash,
		fileMtime: null,
		syncedAt: 0,
		state: 'ok'
	};
}

const note: Note = createNote({
	id: 'note-1',
	title: 'Roadmap',
	folder: 'ideas',
	body: 'local body',
	updatedAt: 1000
});

describe('helpers', () => {
	it('detects git conflict markers', () => {
		expect(hasConflictMarkers('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other')).toBe(true);
		expect(hasConflictMarkers('just text')).toBe(false);
	});

	it('detects a Dropbox conflicted copy', () => {
		expect(isConflictedCopy("Idea (Arif's conflicted copy 2026-10-02).md")).toBe(true);
		expect(isConflictedCopy('Idea.md')).toBe(false);
	});

	it('treats the attachment store as off-limits', () => {
		expect(isAttachmentPath('attachments/ab/ab12.png')).toBe(true);
		expect(isAttachmentPath('attachments')).toBe(true);
		expect(isAttachmentPath('ideas/Note.md')).toBe(false);
	});
});

describe('planSync', () => {
	it('skips the app’s own write coming back', () => {
		const content = renderVaultNote(note);
		const links = new Map([['ideas/Roadmap.md', link('ideas/Roadmap.md', 'note-1', 'hash:' + content)]]);
		const plan = planSync([file('ideas/Roadmap.md', content)], [note], links);
		expect(plan.actions).toEqual([]);
	});

	it('creates a note from a foreign file with no id', () => {
		const plan = planSync([file('Ideas/New Idea.md', '# New Idea\n\nfresh')], [], new Map());
		const create = plan.actions.find((action) => action.kind === 'create');
		expect(create).toMatchObject({ relPath: 'Ideas/New Idea.md', title: 'New Idea', folder: 'Ideas' });
		expect(plan.stats.create).toBe(1);
	});

	it('updates a note whose id is known even after a rename', () => {
		const moved = renderVaultNote({ ...note, body: 'edited outside' });
		const plan = planSync(
			[file('renamed/Anything.md', moved)],
			[note],
			new Map([['ideas/Roadmap.md', link('ideas/Roadmap.md', 'note-1', 'stale')]])
		);
		const update = plan.actions.find((action) => action.kind === 'update');
		expect(update).toMatchObject({ noteId: 'note-1', body: 'edited outside' });
	});

	it('does not blank a note when a known file is emptied', () => {
		const plan = planSync(
			[file('ideas/Roadmap.md', '   \n')],
			[note],
			new Map([['ideas/Roadmap.md', link('ideas/Roadmap.md', 'note-1', 'before')]])
		);
		expect(plan.actions).toEqual([
			{ kind: 'skip', relPath: 'ideas/Roadmap.md', reason: 'empty' }
		]);
	});

	it('reports a file with conflict markers instead of importing it', () => {
		const plan = planSync([file('A.md', '<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b')], [], new Map());
		expect(plan.actions).toEqual([{ kind: 'skip', relPath: 'A.md', reason: 'conflict' }]);
	});

	it('ignores a Dropbox conflicted copy', () => {
		const plan = planSync([file("A (conflicted copy).md", '# A')], [], new Map());
		expect(plan.actions).toEqual([
			{ kind: 'skip', relPath: 'A (conflicted copy).md', reason: 'conflictedCopy' }
		]);
	});

	it('never treats an attachment blob as a note', () => {
		const plan = planSync([file('attachments/ab/ab12.png', 'binary')], [], new Map());
		expect(plan.actions).toEqual([]);
	});

	it('reports the references a folder file points at', () => {
		const plan = planSync(
			[file('A.md', '# A\n\n![x](stylenotes-attachment://ab12cd.png)')],
			[],
			new Map()
		);
		const attachment = plan.actions.find((action) => action.kind === 'attachment');
		expect(attachment).toMatchObject({
			relPath: 'attachments/ab/ab12cd.png',
			reference: 'stylenotes-attachment://ab12cd.png'
		});
	});

	it('reports a link whose note is gone, unless the workspace is orphan-tolerant', () => {
		const links = new Map([['ideas/Gone.md', link('ideas/Gone.md', 'missing-note')]]);
		const strict = planSync([], [], links);
		expect(strict.actions).toEqual([
			{ kind: 'orphanLink', relPath: 'ideas/Gone.md', noteId: 'missing-note' }
		]);
		const tolerant = planSync([], [], links, { orphanTolerant: true });
		expect(tolerant.actions).toEqual([]);
	});

	it('counts every action kind', () => {
		const plan = planSync(
			[
				file('New.md', '# New'),
				file('bad (conflicted copy).md', '# Bad'),
				file('attachments/x/y.png', 'z')
			],
			[],
			new Map()
		);
		expect(plan.stats).toMatchObject({ create: 1, skipped: 1 });
	});
});
