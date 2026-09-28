import {
	isCustomFolder,
	persistFolders,
	persistNotes,
	reassignNotesFolder,
	removeFolderFromList,
	renameFolderInList,
	reorderFolders,
	setFolderIconInList,
	uniqueFolderId,
	type CustomFolder,
	type Folder,
} from '$lib/stores/notes';
import type { Note } from '$lib/content/content';

/** The reactive slices and callbacks the folder operations read and write. */
export type FolderOpsPort = {
	items: Note[];
	customFolders: CustomFolder[];
	activeFolder: string;
	pendingFolder: Folder | null;
	folderDeleteOpen: boolean;
	folders: Folder[];
	notify: (message: string) => void;
};

/**
 * Folder mutations for the workspace rail: create, rename, re-icon, delete and
 * reorder. Each writes through the notes store and reports through `notify`.
 */
export function createFolderOps(port: FolderOpsPort) {
	function commitNew(label: string, icon?: string) {
		const id = uniqueFolderId(label, port.folders.map((folder) => folder.id));
		const next = [...port.customFolders, { id, label, icon }];
		port.customFolders = next;
		port.activeFolder = id;
		void persistFolders(next);
		port.notify(`Folder “${label}” created`);
	}

	function rename(id: string, label: string) {
		const next = renameFolderInList(port.customFolders, id, label);
		port.customFolders = next;
		void persistFolders(next);
		port.notify(`Folder renamed to “${label}”`);
	}

	function setIcon(id: string, icon: string) {
		const next = setFolderIconInList(port.customFolders, id, icon);
		port.customFolders = next;
		void persistFolders(next);
	}

	/** Opens the delete confirmation for a custom folder. */
	function requestDelete(id: string) {
		if (!isCustomFolder(id)) return;
		port.pendingFolder = port.folders.find((folder) => folder.id === id) ?? null;
		port.folderDeleteOpen = port.pendingFolder !== null;
	}

	function performDelete(id: string) {
		if (!isCustomFolder(id)) return;
		const next = removeFolderFromList(port.customFolders, id);
		port.customFolders = next;
		void persistFolders(next);
		const remaining = reassignNotesFolder(port.items, id);
		port.items = remaining;
		void persistNotes(remaining);
		if (port.activeFolder === id) port.activeFolder = 'all';
		port.notify('Folder removed');
	}

	function reorder(fromId: string, toId: string) {
		const next = reorderFolders(port.folders, fromId, toId);
		port.customFolders = next;
		void persistFolders(next);
	}

	return { commitNew, rename, setIcon, requestDelete, performDelete, reorder };
}

export type FolderOps = ReturnType<typeof createFolderOps>;
