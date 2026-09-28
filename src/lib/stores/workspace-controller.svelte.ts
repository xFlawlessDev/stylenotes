import { tick } from 'svelte';
import { createNote as makeNote } from '$lib/content/content';
import { createNoteActions } from '$lib/content/note-actions';
import type { Note } from '$lib/content/content';
import {
	foldersFor,
	persistNote,
	persistNotes,
	removeNote,
	clearNotes,
	resetNotesToSeed,
	loadFolders,
	listNotes,
	applyNotePatch,
	type CustomFolder,
	type Folder,
	type NotePatch,
} from '$lib/stores/notes';
import {
	settings,
	toggleMode,
	resetStoredSettings,
} from '$lib/stores/settings.svelte';
import { persistNotifications, resetNotifications, type AppNotification } from '$lib/stores/notifications';
import type { TaskView } from '$lib/components/tasks/TaskBoard.svelte';
import type { WikiEntity } from '$lib/content/wiki-links';
import { refreshTasks, clearTasks } from '$lib/stores/tasks.svelte';
import type { Task } from '$lib/stores/tasks';
import { isTauri, openNoteWindow, type WorkspaceSection } from '$lib/windows';
import {
	createWorkspace,
	deleteWorkspace,
	renameWorkspace,
	setActiveWorkspace,
	workspaceStore,
} from '$lib/stores/workspaces.svelte';
import { notifyWorkspacesChanged } from '$lib/workspace-sync.svelte';
import { refreshDependencies } from '$lib/stores/dependencies.svelte';
import { startWorkspaceSession } from '$lib/stores/workspace-session.svelte';
import { createFolderOps } from '$lib/stores/workspace-folder-ops';
import { createWikiFlow } from '$lib/stores/workspace-wiki';

const ARCHIVE_FOLDER = 'archive';
const RESTORE_FOLDER = 'personal';

/** All mutable UI state of the workspace window, kept in one reactive object. */
export type WorkspaceState = {
	items: Note[];
	customFolders: CustomFolder[];
	selectedId: string;
	activeFolder: string;
	activeTag: string | null;
	paletteOpen: boolean;
	settingsOpen: boolean;
	notificationsOpen: boolean;
	createOpen: boolean;
	folderOpen: boolean;
	pendingDelete: Note | null;
	deleteOpen: boolean;
	pendingFolder: Folder | null;
	folderDeleteOpen: boolean;
	resetOpen: boolean;
	notifications: AppNotification[];
	toast: string;
	newNoteToken: number;
	fullPreview: boolean;
	ambiguousEntities: WikiEntity[];
	ambiguousHeading: string | null;
	ambiguousOpen: boolean;
	section: WorkspaceSection;
	tasks: Task[];
	selectedTaskId: string;
	taskView: TaskView;
	taskFocusToken: number;
	railOpen: boolean;
	feedOpen: boolean;
	assistantOpen: boolean;
};

/**
 * Owns the workspace window's reactive state and keeps every note, folder,
 * task and workspace mutation in one testable place, away from the markup.
 * `Workspace.svelte` wires this to the shell and overlays.
 */
export function createWorkspaceController() {
	const state = $state<WorkspaceState>({
		items: [],
		customFolders: [],
		selectedId: '',
		activeFolder: 'all',
		activeTag: null,
		paletteOpen: false,
		settingsOpen: false,
		notificationsOpen: false,
		createOpen: false,
		folderOpen: false,
		pendingDelete: null,
		deleteOpen: false,
		pendingFolder: null,
		folderDeleteOpen: false,
		resetOpen: false,
		notifications: [],
		toast: '',
		newNoteToken: 0,
		fullPreview: false,
		ambiguousEntities: [],
		ambiguousHeading: null,
		ambiguousOpen: false,
		section: 'notes',
		tasks: [],
		selectedTaskId: '',
		taskView: 'dashboard',
		taskFocusToken: 0,
		railOpen: false,
		feedOpen: false,
		assistantOpen: false,
	});
	let workspaceLoading = false;
	let persistTimer: ReturnType<typeof setTimeout> | null = null;

	const folders = $derived(foldersFor(state.items, state.customFolders));
	const folderLabelMap = $derived(
		Object.fromEntries(folders.map((folder) => [folder.id, folder.label]))
	);
	const tags = $derived([...new Set(state.items.flatMap((note) => note.tags))]);
	const visible = $derived.by(() => {
		let list =
			state.activeFolder === 'all'
				? state.items
				: state.items.filter((note) => note.folder === state.activeFolder);
		if (state.activeTag) list = list.filter((note) => note.tags.includes(state.activeTag!));
		return list;
	});
	const selected = $derived(
		state.items.find((note) => note.id === state.selectedId) ?? visible[0] ?? state.items[0]
	);

	$effect(() => {
		if (state.activeTag && !tags.includes(state.activeTag)) state.activeTag = null;
	});

	const noteActions = createNoteActions(showToast);

	function showToast(message: string) {
		state.toast = message;
		setTimeout(() => {
			if (state.toast === message) state.toast = '';
		}, 2200);
	}

	/** Reloads the notes, folders and tasks of the active workspace. */
	async function reloadWorkspaceRecords() {
		const [storedNotes, storedFolders, storedTasks] = await Promise.all([
			listNotes(),
			loadFolders(),
			refreshTasks(),
			refreshDependencies(),
		]);
		state.items = storedNotes;
		state.customFolders = storedFolders;
		state.tasks = storedTasks;
		state.selectedId = state.items[0]?.id ?? '';
		state.selectedTaskId = storedTasks[0]?.id ?? '';
		state.activeFolder = 'all';
		state.activeTag = null;
		state.taskFocusToken += 1;
	}

	async function changeWorkspace(id: string) {
		if (workspaceLoading) return;
		workspaceLoading = true;
		if (await setActiveWorkspace(id)) {
			await reloadWorkspaceRecords();
			// The dock, Kanban and detail windows follow the selection.
			notifyWorkspacesChanged();
		} else {
			showToast('Could not save the workspace choice — it may reset on restart');
		}
		workspaceLoading = false;
	}

	/** Workspace CRUD for the switcher dialog; every failure becomes a toast. */
	async function createWorkspaceByName(name: string) {
		const workspace = await createWorkspace(name);
		if (!workspace) {
			showToast('Could not create workspace');
			return false;
		}
		await changeWorkspace(workspace.id);
		return true;
	}

	async function renameWorkspaceById(id: string, name: string) {
		if (!(await renameWorkspace(id, name))) {
			showToast('Could not rename workspace');
			return false;
		}
		notifyWorkspacesChanged();
		showToast('Workspace renamed');
		return true;
	}

	async function deleteWorkspaceById(id: string) {
		const wasActive = id === workspaceStore.activeId;
		if (!(await deleteWorkspace(id))) {
			showToast('Could not delete workspace');
			return false;
		}
		if (wasActive) await changeWorkspace(workspaceStore.activeId);
		else notifyWorkspacesChanged();
		showToast('Workspace deleted');
		return true;
	}

	function createNote() {
		state.createOpen = true;
	}

	async function persistNoteOrToast(note: Note) {
		const ok = await persistNote(note);
		if (!ok) showToast('Could not save note — changes may be lost');
	}

	async function commitNewNote(data: { title: string; folder: string; body: string }) {
		const note = makeNote({
			...data,
			workspaceId: workspaceStore.activeId,
			title: data.title.trim() || 'Untitled note',
		});
		state.items = [note, ...state.items];
		state.selectedId = note.id;
		state.activeFolder = data.folder;
		state.activeTag = null;
		state.newNoteToken += 1;
		state.section = 'notes';
		showToast('Note created');
		await persistNoteOrToast(note);
	}

	const folderOps = createFolderOps({
		get items() { return state.items; },
		set items(value: Note[]) { state.items = value; },
		get customFolders() { return state.customFolders; },
		set customFolders(value: CustomFolder[]) { state.customFolders = value; },
		get activeFolder() { return state.activeFolder; },
		set activeFolder(value: string) { state.activeFolder = value; },
		get pendingFolder() { return state.pendingFolder; },
		set pendingFolder(value: Folder | null) { state.pendingFolder = value; },
		get folderDeleteOpen() { return state.folderDeleteOpen; },
		set folderDeleteOpen(value: boolean) { state.folderDeleteOpen = value; },
		get folders() { return folders; },
		notify: showToast,
	});

	const wiki = createWikiFlow({
		get items() { return state.items; },
		set items(value: Note[]) { state.items = value; },
		get customFolders() { return state.customFolders; },
		get tasks() { return state.tasks; },
		get selectedId() { return state.selectedId; },
		set selectedId(value: string) { state.selectedId = value; },
		get section() { return state.section; },
		set section(value: WorkspaceSection) { state.section = value; },
		get taskView() { return state.taskView; },
		set taskView(value: TaskView) { state.taskView = value; },
		get selectedTaskId() { return state.selectedTaskId; },
		set selectedTaskId(value: string) { state.selectedTaskId = value; },
		get taskFocusToken() { return state.taskFocusToken; },
		set taskFocusToken(value: number) { state.taskFocusToken = value; },
		get ambiguousEntities() { return state.ambiguousEntities; },
		set ambiguousEntities(value: WikiEntity[]) { state.ambiguousEntities = value; },
		get ambiguousHeading() { return state.ambiguousHeading; },
		set ambiguousHeading(value: string | null) { state.ambiguousHeading = value; },
		get ambiguousOpen() { return state.ambiguousOpen; },
		set ambiguousOpen(value: boolean) { state.ambiguousOpen = value; },
		get activeFolder() { return state.activeFolder; },
		set activeFolder(value: string) { state.activeFolder = value; },
		get activeTag() { return state.activeTag; },
		set activeTag(value: string | null) { state.activeTag = value; },
		notify: showToast,
	});

	const handleWikiClick = wiki.handleClick;
	const handleChatWikiClick = wiki.handleChatClick;
	const selectWikiTarget = wiki.selectTarget;
	const openGraphNode = wiki.openGraphNode;
	const openAddFolder = () => { state.folderOpen = true; };
	const commitNewFolder = folderOps.commitNew;
	const renameFolder = folderOps.rename;
	const setFolderIcon = folderOps.setIcon;
	const deleteFolder = folderOps.requestDelete;
	const performDeleteFolder = folderOps.performDelete;
	const reorderFolder = folderOps.reorder;

	function updateNote(id: string, patch: NotePatch) {
		let updated: Note | undefined;
		state.items = state.items.map((note) => {
			if (note.id !== id) return note;
			updated = applyNotePatch(note, patch);
			return updated;
		});

		if (!updated) return;
		const toSave = updated;
		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			void persistNoteOrToast(toSave);
		}, 250);
	}

	function deleteNote(id: string) {
		if (!settings.confirmDelete) {
			performDelete(id);
			return;
		}
		state.pendingDelete = state.items.find((note) => note.id === id) ?? null;
		state.deleteOpen = state.pendingDelete !== null;
	}

	function performDelete(id: string) {
		state.items = state.items.filter((note) => note.id !== id);
		if (state.selectedId === id) state.selectedId = state.items[0]?.id ?? '';
		void removeNote(id);
		showToast('Note deleted');
	}

	function selectFolder(id: string) {
		state.activeFolder = id;
		state.activeTag = null;
		const pool = id === 'all' ? state.items : state.items.filter((note) => note.folder === id);
		if (!pool.some((note) => note.id === state.selectedId)) state.selectedId = pool[0]?.id ?? '';
	}

	function selectTag(tag: string | null) {
		const next = !tag || tag === state.activeTag ? null : tag;
		state.activeTag = next;
		const pool = next
			? state.items.filter(
					(note) =>
						(state.activeFolder === 'all' || note.folder === state.activeFolder) &&
						note.tags.includes(next)
				)
			: [];
		if (next && !pool.some((note) => note.id === state.selectedId)) {
			state.selectedId = pool[0]?.id ?? '';
		}
	}

	/**
	 * Notes feed quick menu: `archived` mirrors `NoteEditor.toggleArchive`, and
	 * the rest reuse the same handlers as `NoteToolbar` so both paths agree.
	 */
	function toggleArchive(id: string) {
		const note = state.items.find((item) => item.id === id);
		if (!note) return;
		updateNote(id, { folder: note.folder === ARCHIVE_FOLDER ? RESTORE_FOLDER : ARCHIVE_FOLDER });
	}

	function openNoteInWindow(id: string) {
		if (isTauri) void openNoteWindow(id);
	}

	async function resetData() {
		await clearNotes();
		await resetStoredSettings();
		await clearTasks();
		const [fresh, freshNotifications] = await Promise.all([
			resetNotesToSeed(),
			resetNotifications(),
		]);
		state.items = fresh;
		state.customFolders = [];
		state.selectedId = state.items[0]?.id ?? '';
		state.notifications = freshNotifications;
		state.tasks = [];
		state.activeFolder = 'all';
		state.activeTag = null;
		showToast('Data reset to samples');
	}

	function markRead(id: string) {
		state.notifications = state.notifications.map((item) =>
			item.id === id ? { ...item, read: true } : item
		);
		void persistNotifications(state.notifications);
	}

	function markAllRead() {
		state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
		void persistNotifications(state.notifications);
	}

	function clearNotifications() {
		state.notifications = [];
		void persistNotifications([]);
	}

	function closePanels() {
		state.paletteOpen = false;
		state.settingsOpen = false;
		state.notificationsOpen = false;
	}

	function openPalette() {
		closePanels();
		state.paletteOpen = true;
	}

	function openSettings() {
		closePanels();
		state.settingsOpen = true;
	}

	function selectTask(next: string) {
		state.selectedTaskId = next;
		state.taskFocusToken += 1;
		state.section = 'tasks';
	}

	function onGlobalKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key === 'Escape' && state.fullPreview) {
			state.fullPreview = false;
			return;
		}
		if (event.key === 'Escape' && state.assistantOpen) {
			state.assistantOpen = false;
			return;
		}
		const mod = event.ctrlKey || event.metaKey;
		if (!mod) return;
		// Only the bare Ctrl/Cmd combos below belong to the app; Ctrl+Shift+… is
		// reserved for system/global shortcuts.
		if (event.shiftKey || event.altKey) return;
		const key = event.key.toLowerCase();
		if (key === 'k') {
			event.preventDefault();
			openPalette();
		} else if (key === 'n') {
			event.preventDefault();
			createNote();
		} else if (key === ',') {
			event.preventDefault();
			openSettings();
		} else if (key === '/') {
			event.preventDefault();
			toggleMode();
		}
	}

	startWorkspaceSession(state, reloadWorkspaceRecords, () => persistTimer !== null);

	return {
		state,
		// Defined as getters so Svelte reads the live `$derived` value on every
		// access; putting the derived variable in the object literal would
		// capture its initial (empty) value at construction time.
		get folders() {
			return folders;
		},
		get folderLabelMap() {
			return folderLabelMap;
		},
		get tags() {
			return tags;
		},
		get visible() {
			return visible;
		},
		get selected() {
			return selected;
		},
		noteActions,
		showToast,
		changeWorkspace,
		createWorkspaceByName,
		renameWorkspaceById,
		deleteWorkspaceById,
		createNote,
		commitNewNote,
		handleWikiClick,
		handleChatWikiClick,
		selectWikiTarget,
		openGraphNode,
		openAddFolder,
		commitNewFolder,
		renameFolder,
		setFolderIcon,
		deleteFolder,
		performDeleteFolder,
		reorderFolder,
		updateNote,
		deleteNote,
		performDelete,
		selectFolder,
		selectTag,
		toggleArchive,
		openNoteInWindow,
		resetData,
		markRead,
		markAllRead,
		clearNotifications,
		closePanels,
		openPalette,
		openSettings,
		selectTask,
		onGlobalKeydown,
	};
}

export type WorkspaceController = ReturnType<typeof createWorkspaceController>;
