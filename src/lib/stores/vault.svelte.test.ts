import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the vault store: the orchestration between the pure
 * planners and the Tauri commands. `planSync`/`planExport` are covered by their
 * own tests; this file checks that the store wires them to `invoke`, the repos,
 * and the one write door correctly — the layer that was previously untested.
 */

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	persistNote: vi.fn(),
	listNotes: vi.fn(),
	captureVersion: vi.fn(),
	repo: {
		binding: vi.fn(),
		setBinding: vi.fn(),
		otherPaths: vi.fn(),
		links: vi.fn(),
		put: vi.fn(),
		putMany: vi.fn()
	}
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: mocks.invoke,
	Channel: class {
		onmessage: ((value: unknown) => void) | null = null;
	}
}));

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/windows', () => ({ isTauri: true }));

vi.mock('$lib/db/vault', () => ({ vaultRepo: mocks.repo }));
vi.mock('$lib/stores/notes', () => ({
	listNotes: mocks.listNotes,
	persistNote: mocks.persistNote
}));
vi.mock('$lib/stores/versioning', () => ({ captureVersion: mocks.captureVersion }));
vi.mock('$lib/stores/workspaces.svelte', () => ({
	workspaceStore: { activeId: 'ws-1', items: [], loaded: true }
}));

import {
	exportVault,
	reconcileVault,
	resolveVaultConflict,
	vaultStore
} from '$lib/stores/vault.svelte';
import {
	createNote,
	type Note
} from '$lib/content/content';
import { renderVaultNote } from '$lib/content/vault-format';
import type { VaultFile } from '$lib/db/vault';

/** The note the store reads from the app. */
let notes: Note[];

/** What `vault_scan` returns for the next call. */
let scan: VaultFile[];

const file = (relPath: string, content: string, contentHash: string): VaultFile => ({
	relPath,
	content,
	contentHash,
	mtime: 0
});

beforeEach(() => {
	vi.clearAllMocks();
	notes = [];
	scan = [];

	vaultStore.mode = 'mirror';
	vaultStore.path = 'C:/vault';
	vaultStore.type = 'app';
	vaultStore.status = 'idle';
	vaultStore.error = null;
	vaultStore.conflicts = [];
	vaultStore.lastExport = null;

	mocks.listNotes.mockImplementation(async () => notes);
	mocks.persistNote.mockResolvedValue(true);
	mocks.captureVersion.mockResolvedValue(true);
	mocks.repo.links.mockResolvedValue(new Map());
	mocks.repo.put.mockResolvedValue(true);
	mocks.repo.putMany.mockResolvedValue(0);
	mocks.repo.otherPaths.mockResolvedValue([]);
	mocks.repo.setBinding.mockResolvedValue(true);

	mocks.invoke.mockImplementation(async (command: string) => {
		if (command === 'vault_scan') return scan;
		if (command === 'vault_import_attachment') return 'deadbeef';
		if (command === 'vault_export_files') {
			// Echo back a hash per file so `vault_links` gets written.
			const args = mocks.invoke.mock.calls.at(-1)?.[1] as {
				files: { relPath: string; content: string }[];
			};
			return args.files.map((entry) => ({
				relPath: entry.relPath,
				contentHash: `hash:${entry.content}`,
				bytes: entry.content.length,
				written: true
			}));
		}
		return undefined;
	});
});

describe('exportVault', () => {
	it('writes rendered notes and records a link per file', async () => {
		notes = [createNote({ id: 'n1', title: 'Roadmap', folder: 'ideas', body: 'body' })];

		const stats = await exportVault();

		expect(stats).toMatchObject({ files: 1, written: 1, failed: 0 });
		const exportCall = mocks.invoke.mock.calls.find(([command]) => command === 'vault_export_files');
		const files = (exportCall?.[1] as { files: { relPath: string }[] }).files;
		expect(files[0].relPath).toBe('ideas/Roadmap.md');
		expect(mocks.repo.putMany).toHaveBeenCalled();
	});

	it('does nothing when the workspace is a read-only folder', async () => {
		vaultStore.type = 'folder';
		expect(await exportVault()).toBeNull();
		expect(mocks.invoke).not.toHaveBeenCalled();
	});

	it('does nothing when the mode is off', async () => {
		vaultStore.mode = 'off';
		expect(await exportVault()).toBeNull();
	});
});

describe('reconcileVault', () => {
	it('creates a note from a foreign file and stamps the id back', async () => {
		scan = [file('Ideas/New.md', '# New Idea\n\nfresh', 'hash:file')];

		const result = await reconcileVault();

		expect(result).toMatchObject({ created: 1, updated: 0, failed: 0 });
		expect(mocks.persistNote).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'New Idea', folder: 'Ideas', body: '# New Idea\n\nfresh' })
		);
		// The id is written back so a later rename is an update.
		const stamp = mocks.invoke.mock.calls.find(([command]) => command === 'vault_export_files');
		expect(stamp).toBeDefined();
	});

	it('ignores a file whose hash matches what the app last wrote', async () => {
		scan = [file('ideas/Roadmap.md', 'anything', 'same')];
		mocks.repo.links.mockResolvedValue(
			new Map([
				[
					'ideas/Roadmap.md',
					{
						workspaceId: 'ws-1',
						relPath: 'ideas/Roadmap.md',
						entityKind: 'note',
						entityId: 'n1',
						contentHash: 'same',
						fileMtime: null,
						syncedAt: 0,
						state: 'ok'
					}
				]
			])
		);

		const result = await reconcileVault();

		expect(result).toMatchObject({ created: 0, updated: 0 });
		expect(mocks.persistNote).not.toHaveBeenCalled();
	});

	it('queues a conflict instead of overwriting when both sides changed', async () => {
		notes = [createNote({ id: 'n1', title: 'Roadmap', folder: 'ideas', body: 'edited in app', updatedAt: 1000 })];
		scan = [file('ideas/Roadmap.md', renderVaultNote(notes[0]), 'hash:file')];
		mocks.repo.links.mockResolvedValue(
			new Map([
				[
					'ideas/Roadmap.md',
					{
						workspaceId: 'ws-1',
						relPath: 'ideas/Roadmap.md',
						entityKind: 'note',
						entityId: 'n1',
						contentHash: 'old',
						fileMtime: null,
						syncedAt: 500,
						state: 'ok'
					}
				]
			])
		);

		const result = await reconcileVault();

		expect(vaultStore.conflicts).toHaveLength(1);
		expect(vaultStore.conflicts[0]).toMatchObject({ noteId: 'n1', localBody: 'edited in app' });
		expect(result).toMatchObject({ updated: 0, created: 0 });
	});

	it('reports an orphan link rather than deleting the note', async () => {
		mocks.repo.links.mockResolvedValue(
			new Map([
				[
					'ideas/Gone.md',
					{
						workspaceId: 'ws-1',
						relPath: 'ideas/Gone.md',
						entityKind: 'note',
						entityId: 'missing',
						contentHash: 'x',
						fileMtime: null,
						syncedAt: 0,
						state: 'ok'
					}
				]
			])
		);

		const result = await reconcileVault();

		expect(result?.orphans).toEqual(['ideas/Gone.md']);
		expect(mocks.persistNote).not.toHaveBeenCalled();
	});

	it('pulls an attachment the folder references', async () => {
		scan = [file('ideas/Pic.md', '# Pic\n\n![x](stylenotes-attachment://ab12cd.png)', 'h')];

		const result = await reconcileVault();

		expect(result?.imported).toBe(1);
		expect(mocks.invoke).toHaveBeenCalledWith(
			'vault_import_attachment',
			expect.objectContaining({ relPath: 'attachments/ab/ab12cd.png' })
		);
	});

	it('counts a failed note write instead of hiding it', async () => {
		scan = [file('Ideas/New.md', '# New', 'h')];
		mocks.persistNote.mockResolvedValue(false);

		const result = await reconcileVault();

		expect(result).toMatchObject({ created: 0, failed: 1 });
	});
});

describe('resolveVaultConflict', () => {
	beforeEach(() => {
		vaultStore.conflicts = [
			{
				kind: 'conflict',
				relPath: 'ideas/Roadmap.md',
				noteId: 'n1',
				localTitle: 'Roadmap',
				localFolder: 'ideas',
				localBody: 'app body',
				localTags: [],
				fileTitle: 'Roadmap',
				fileFolder: 'ideas',
				fileBody: 'folder body',
				fileTags: [],
				contentHash: 'hash:file'
			}
		];
	});

	it('keep-app re-exports and clears the conflict', async () => {
		notes = [createNote({ id: 'n1', title: 'Roadmap', folder: 'ideas', body: 'app body' })];

		const ok = await resolveVaultConflict('ideas/Roadmap.md', 'app');

		expect(ok).toBe(true);
		expect(mocks.invoke).toHaveBeenCalledWith('vault_export_files', expect.anything());
		expect(vaultStore.conflicts).toEqual([]);
	});

	it('keep-file updates the note and keeps the app version in history', async () => {
		notes = [createNote({ id: 'n1', title: 'Roadmap', folder: 'ideas', body: 'app body' })];

		const ok = await resolveVaultConflict('ideas/Roadmap.md', 'file');

		expect(ok).toBe(true);
		expect(mocks.captureVersion).toHaveBeenCalledWith(
			'note',
			'n1',
			expect.objectContaining({ body: 'app body' }),
			'vault',
			expect.any(Number)
		);
		expect(mocks.persistNote).toHaveBeenCalledWith(
			expect.objectContaining({ body: 'folder body' })
		);
		expect(vaultStore.conflicts).toEqual([]);
	});

	it('keep-both adds the folder version as a second note', async () => {
		notes = [createNote({ id: 'n1', title: 'Roadmap', folder: 'ideas', body: 'app body' })];

		const ok = await resolveVaultConflict('ideas/Roadmap.md', 'both');

		expect(ok).toBe(true);
		expect(mocks.persistNote).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'Roadmap (folder)', body: 'folder body' })
		);
		expect(vaultStore.conflicts).toEqual([]);
	});
});
