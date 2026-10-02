/**
 * Vault folder orchestration (docs/design/vault-mirror.md).
 *
 * Owns the per-workspace binding, the folder export, and the derived
 * `vault_links` index. SQLite stays the source of truth: this store only writes
 * markdown copies outward and records what it wrote, so nothing here can touch a
 * note. A failing export is reported, never swallowed.
 *
 * Only the workspace window runs an export, matching the MCP host (#V5), and the
 * command surface lives in Rust so the webview never gains filesystem scope
 * (#V13).
 */

import { browser } from '$app/environment';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '$lib/windows';
import { listNotes, persistNote } from '$lib/stores/notes';
import { createNote } from '$lib/content/content';
import { captureVersion } from '$lib/stores/versioning';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
import { vaultRepo, type VaultBinding, type VaultLink, type VaultMode, type VaultWorkspaceType } from '$lib/db/vault';
import { planExport, attachmentRelPath } from '$lib/content/vault-plan';
import { planSync } from '$lib/content/vault-reconcile';
import { renderVaultNote } from '$lib/content/vault-format';

export type VaultStatus = 'idle' | 'exporting' | 'error' | 'missing';
export type VaultStats = { files: number; written: number; attachments: number; failed: number };

export type VaultSyncResult = {
	created: number;
	updated: number;
	imported: number;
	skipped: { relPath: string; reason: string }[];
	orphans: string[];
	failed: number;
};

type RustWriteResult = { relPath: string; contentHash: string; bytes: number; written: boolean };
type RustVaultFile = { relPath: string; content: string; contentHash: string; mtime: number };

export const vaultStore = $state<{
	/** True once the binding for the active workspace has been read. */
	loaded: boolean;
	mode: VaultMode;
	path: string | null;
	type: VaultWorkspaceType;
	status: VaultStatus;
	lastExport: VaultStats | null;
	error: string | null;
}>({
	loaded: false,
	mode: 'off',
	path: null,
	type: 'app',
	status: 'idle',
	lastExport: null,
	error: null
});

function currentBinding(): VaultBinding {
	return { mode: vaultStore.mode, path: vaultStore.path, type: vaultStore.type };
}

/** Reads the active workspace's vault binding. */
export async function hydrateVault(): Promise<void> {
	if (!browser || !isTauri) return;
	const binding = await vaultRepo.binding(workspaceStore.activeId);
	vaultStore.mode = binding.mode;
	vaultStore.path = binding.path;
	vaultStore.type = binding.type;
	vaultStore.loaded = true;
}

/**
 * Binds a folder to the active workspace as a mirror.
 *
 * The Rust command canonicalises the path and refuses overlap with another
 * workspace's vault, so the check happens once, next to the filesystem (#V20).
 */
export async function chooseVaultFolder(): Promise<boolean> {
	if (!browser || !isTauri) return false;
	// The picker lives in the frontend; the chosen path is validated in Rust.
	const { open } = await import('@tauri-apps/plugin-dialog');
	const picked = await open({ directory: true, multiple: false, title: 'Vault folder' });
	if (!picked || typeof picked !== 'string') return false;

	const others = await vaultRepo.otherPaths(workspaceStore.activeId);
	let canonical: string;
	try {
		canonical = await invoke<string>('vault_validate_root', { path: picked, others });
	} catch (cause) {
		vaultStore.error = cause instanceof Error ? cause.message : String(cause);
		vaultStore.status = 'error';
		return false;
	}

	const ok = await vaultRepo.setBinding(workspaceStore.activeId, {
		mode: 'mirror',
		path: canonical,
		type: vaultStore.type
	});
	if (!ok) {
		vaultStore.error = 'save';
		vaultStore.status = 'error';
		return false;
	}
	vaultStore.mode = 'mirror';
	vaultStore.path = canonical;
	vaultStore.status = 'idle';
	vaultStore.error = null;
	return true;
}

/** Changes the mode (or workspace type) without moving the folder. */
export async function setVaultMode(mode: VaultMode, type: VaultWorkspaceType = vaultStore.type): Promise<boolean> {
	if (!browser || !isTauri) return false;
	// 'off' clears the folder so an unbound workspace cannot look bound.
	const path = mode === 'off' ? null : vaultStore.path;
	const ok = await vaultRepo.setBinding(workspaceStore.activeId, { mode, path, type });
	if (!ok) return false;
	vaultStore.mode = mode;
	vaultStore.type = type;
	vaultStore.path = path;
	return true;
}

/**
 * Copies every file an export references out of the attachment store.
 *
 * A blob is copied by its absolute store path; the Rust side deduplicates by
 * content, so a repeated export writes nothing. A blob that is missing locally
 * is skipped with a count rather than failing the whole export.
 */
async function copyAttachments(references: string[], root: string): Promise<number> {
	let copied = 0;
	for (const reference of references) {
		const relPath = attachmentRelPath(reference);
		if (!relPath) continue;
		try {
			const source = await invoke<string | null>('attachment_path', { reference });
			if (!source) continue;
			await invoke<RustWriteResult>('vault_copy_file', { root, relPath, source });
			copied += 1;
		} catch {
			// A missing or unreadable blob must not fail the note export.
		}
	}
	return copied;
}

/**
 * Exports the active workspace's notes into its vault folder.
 *
 * Reports a summary; on failure leaves `status = 'error'` with a message. The
 * export is idempotent: unchanged files are skipped in Rust by content hash, so
 * a re-run writes nothing and does not disturb a file watcher (#V7).
 */
export async function exportVault(): Promise<VaultStats | null> {
	if (!browser || !isTauri || !vaultStore.path || vaultStore.mode === 'off') return null;
	// A `type = 'folder'` workspace is read-only by design: the app must not
	// stamp its frontmatter onto files the user already owns (#V21).
	if (vaultStore.type === 'folder') return null;
	if (vaultStore.status === 'exporting') return null;
	vaultStore.status = 'exporting';
	vaultStore.error = null;
	try {
		const root = vaultStore.path;
		const notes = await listNotes(workspaceStore.activeId);
		const plan = planExport(notes);

		let results: RustWriteResult[] = [];
		try {
			results = await invoke<RustWriteResult[]>('vault_export_files', {
				root,
				files: plan.files.map((file) => ({ relPath: file.relPath, content: file.content }))
			});
		} catch (cause) {
			vaultStore.error = cause instanceof Error ? cause.message : String(cause);
			vaultStore.status = 'error';
			return null;
		}

		const byPath = new Map(plan.files.map((file) => [file.relPath, file.noteId]));
		const now = Date.now();
		const links = results.map((result) => ({
			workspaceId: workspaceStore.activeId,
			relPath: result.relPath,
			entityKind: 'note' as const,
			entityId: byPath.get(result.relPath) ?? null,
			contentHash: result.contentHash,
			fileMtime: null,
			syncedAt: now,
			state: 'ok' as const
		}));

		const attachments = await copyAttachments(plan.references, root);
		const failed = await vaultRepo.putMany(links);

		const stats: VaultStats = {
			files: plan.files.length,
			written: results.filter((result) => result.written).length,
			attachments,
			failed
		};
		vaultStore.lastExport = stats;
		vaultStore.status = failed > 0 ? 'error' : 'idle';
		if (failed > 0) vaultStore.error = 'index';
		return stats;
	} catch (cause) {
		vaultStore.error = cause instanceof Error ? cause.message : String(cause);
		vaultStore.status = 'error';
		return null;
	}
}

/** Exposed for the settings preview and tests. */
export function currentVaultBinding(): VaultBinding {
	return currentBinding();
}

/**
 * Reads changes made in the folder back into the app (docs/design/vault-mirror.md).
 *
 * This is the F1 half of the loop: the folder is read with `vault_scan`, compared
 * against the notes and `vault_links` with the pure `planSync`, and the resulting
 * notes are written through `persistNote` — the same door the editor uses. Reads
 * are additive: a file the app has never seen becomes a note, and a file it *has*
 * seen is only changed when the bytes actually differ from what we wrote (#V7).
 *
 * Nothing here deletes a note. A file that disappears is reported as a recoverable
 * orphan link, never an automatic removal (#V8); the caller decides.
 */
export async function reconcileVault(): Promise<VaultSyncResult | null> {
	if (!browser || !isTauri || !vaultStore.path) return null;
	// A normal workspace needs a mode; a read-only folder workspace reads even
	// with the mode at `off`, since reading is all it is allowed to do (#V21).
	if (vaultStore.mode === 'off' && vaultStore.type !== 'folder') return null;
	if (vaultStore.status === 'exporting') return null;
	vaultStore.status = 'exporting';
	vaultStore.error = null;

	const result: VaultSyncResult = {
		created: 0,
		updated: 0,
		imported: 0,
		skipped: [],
		orphans: [],
		failed: 0
	};

	try {
		const root = vaultStore.path;
		const workspaceId = workspaceStore.activeId;

		const files = await invoke<RustVaultFile[]>('vault_scan', { root, recursive: true });
		const notes = await listNotes(workspaceId);
		const links = await vaultRepo.links(workspaceId);
		const plan = planSync(files, notes, links, { orphanTolerant: vaultStore.type === 'folder' });

		// The note a link points at, for the conflict check on updates.
		const byId = new Map(notes.map((note) => [note.id, note]));
		const now = Date.now();
		const linkWrites: VaultLink[] = [];

		for (const action of plan.actions) {
			if (action.kind === 'skip') {
				result.skipped.push({ relPath: action.relPath, reason: action.reason });
				continue;
			}
			if (action.kind === 'orphanLink') {
				result.orphans.push(action.relPath);
				continue;
			}
			if (action.kind === 'attachment') {
				try {
					await invoke<string>('vault_import_attachment', {
						root,
						relPath: action.relPath
					});
					result.imported += 1;
				} catch {
					// A missing or unreadable blob never fails the note import.
				}
				continue;
			}

			if (action.kind === 'update') {
				const previous = action.noteId ? byId.get(action.noteId) : undefined;
				if (previous) {
					// The folder overwrote the body; keep the app's version so the
					// change is recoverable from Record History (#V8).
					await captureVersion(
						'note',
						previous.id,
						{ title: previous.title, body: previous.body, tags: [...previous.tags], folder: previous.folder },
						'vault',
						now
					).catch(() => false);
					const next = {
						...previous,
						title: action.title,
						folder: action.folder,
						tags: action.tags,
						body: action.body,
						updatedAt: now
					};
					if (await persistNote(next)) {
						result.updated += 1;
					} else {
						result.failed += 1;
					}
				}
				linkWrites.push(vaultLink(workspaceId, action.relPath, action.noteId ?? null, action.contentHash, now));
				continue;
			}

			// create: a file the app has never seen. `createNote` fills the derived
			// fields and a fresh id, which is then written back into the file (#V4).
			const note = createNote({
				workspaceId,
				title: action.title,
				folder: action.folder,
				tags: action.tags,
				body: action.body,
				updatedAt: now
			});
			if (await persistNote(note)) {
				result.created += 1;
				linkWrites.push(vaultLink(workspaceId, action.relPath, note.id, action.contentHash, now));
				if (vaultStore.type !== 'folder') {
					// Stamp the id into the file so the next read recognises it and a
					// rename becomes an update instead of a new note.
					await invoke<RustWriteResult[]>('vault_export_files', {
						root,
						files: [{ relPath: action.relPath, content: renderVaultNote(note) }]
					}).catch(() => undefined);
				}
			} else {
				result.failed += 1;
			}
		}

		const linkFailures = await vaultRepo.putMany(linkWrites);
		result.failed += linkFailures;
		vaultStore.status = result.failed > 0 ? 'error' : 'idle';
		if (result.failed > 0) vaultStore.error = 'index';
		return result;
	} catch (cause) {
		vaultStore.error = cause instanceof Error ? cause.message : String(cause);
		vaultStore.status = 'error';
		return null;
	}
}

/** The number of milliseconds between automatic two-way syncs. */
export const VAULT_SYNC_INTERVAL_MS = 20_000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncRunning = false;

/**
 * Runs one automatic cycle: read the folder, then write it back.
 *
 * Read-then-write, never the other way round, so an outside edit is imported
 * before the app re-exports. `exportVault` then skips unchanged files by hash, so
 * the write step does not change `mtime` and the next read sees nothing new —
 * the loop terminates (#V7). Also exports the `id` the app stamped onto a file it
 * created, so a rename is an update from then on (#V4).
 */
async function runVaultCycle(): Promise<void> {
	if (syncRunning) return;
	syncRunning = true;
	try {
		await reconcileVault();
		await exportVault();
	} finally {
		syncRunning = false;
	}
}

/**
 * Starts automatic two-way sync for a workspace in `vault` mode.
 *
 * A poll rather than a filesystem watcher: `notify` (the recursive watcher of
 * #V19) is still to come, and the sweep already handles files made while the app
 * was closed (#V18). It runs only in the always-alive `workspace` window (#V5),
 * only when the mode is `vault`, and does nothing while an export is in flight.
 */
export function startVaultSync(): void {
	if (!browser || !isTauri) return;
	void hydrateVault().then(() => {
		if (vaultStore.mode !== 'vault') return;
		if (syncTimer) clearInterval(syncTimer);
		syncTimer = setInterval(() => {
			if (vaultStore.mode === 'vault' && vaultStore.path) void runVaultCycle();
		}, VAULT_SYNC_INTERVAL_MS);
	});
}

/** Stops the automatic sync, e.g. when the window tears down. */
export function stopVaultSync(): void {
	if (syncTimer) {
		clearInterval(syncTimer);
		syncTimer = null;
	}
}

/** Builds a `vault_links` row for a synced file. */
function vaultLink(
	workspaceId: string,
	relPath: string,
	entityId: string | null,
	contentHash: string,
	now: number
) {
	return {
		workspaceId,
		relPath,
		entityKind: 'note' as const,
		entityId,
		contentHash,
		fileMtime: null,
		syncedAt: now,
		state: 'ok' as const
	};
}