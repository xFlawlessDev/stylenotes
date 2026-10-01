import { tick } from 'svelte';
import { t } from '$lib/i18n/index.svelte';
import { createNoteActions } from '$lib/content/note-actions';
import type { Note } from '$lib/content/content';
import {
	foldersFor,
	persistNotes,
	clearNotes,
	resetNotesToSeed,
	loadFolders,
	listNotes,
	type CustomFolder,
	type Folder,
	type NotePatch,
} from '$lib/stores/notes';
import {
	settings,
	toggleMode,
	resetStoredSettings,
	localToday,
} from '$lib/stores/settings.svelte';
import { createJournalOps } from '$lib/stores/workspace-journal-ops';
import { createNoteOps } from '$lib/stores/workspace-note-ops';
import { createWorkspaceOps } from '$lib/stores/workspace-ops';
import type { AppNotification } from '$lib/stores/notifications';
import { createNotificationOps } from '$lib/stores/workspace-notification-ops';
import type { SettingsSection } from '$lib/content/settings-sections';
import type { TaskView } from '$lib/components/tasks/TaskBoard.svelte';
import type { WikiEntity } from '$lib/content/wiki-links';
import { refreshTasks, clearTasks, listAllTasks } from '$lib/stores/tasks.svelte';
import type { Task } from '$lib/stores/tasks';
import { isTauri, openNoteWindow, type WorkspaceSection } from '$lib/windows';
import { workspaceStore } from '$lib/stores/workspaces.svelte';
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
	/** The section Settings should land on, or `null` for "wherever it was". */
	settingsSection: SettingsSection | null;
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
		settingsSection: null,
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

	/**
	 * Reloads the notes, folders and tasks of `workspaceId` (the active
	 * workspace by default). Pass the id explicitly when the caller just moved
	 * the selection, so the read cannot race another window's switch.
	 */
	async function reloadWorkspaceRecords(workspaceId = workspaceStore.activeId) {
		const [storedNotes, storedFolders, storedTasks] = await Promise.all([
			listNotes(workspaceId),
			loadFolders(workspaceId),
			refreshTasks(workspaceId),
			refreshDependencies(workspaceId),
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

	const workspaceOps = createWorkspaceOps({
		reload: (workspaceId) => reloadWorkspaceRecords(workspaceId),
		notify: showToast,
	});

	const changeWorkspace = workspaceOps.change;
	const createWorkspaceByName = workspaceOps.createByName;
	const renameWorkspaceById = workspaceOps.renameById;
	const deleteWorkspaceById = workspaceOps.deleteById;
	const unsavedWorkspaceRecords = workspaceOps.unsavedRecords;

	function createNote() {
		noteOps.openCreate();
	}

	/**
	 * Opens (or starts) the journal entry for a day, and selects it. The ops
	 * module owns the behaviour; this keeps the call site readable.
	 */
	const openJournalDayFor = (day: string) => journalOps.openDay(day);

	async function commitNewNote(data: { title: string; folder: string; body: string }) {
		await noteOps.commitNew(data);
	}

	const noteOps = createNoteOps({
		get items() { return state.items; },
		set items(value: Note[]) { state.items = value; },
		get selectedId() { return state.selectedId; },
		set selectedId(value: string) { state.selectedId = value; },
		get newNoteToken() { return state.newNoteToken; },
		set newNoteToken(value: number) { state.newNoteToken = value; },
		get activeFolder() { return state.activeFolder; },
		set activeFolder(value: string) { state.activeFolder = value; },
		get activeTag() { return state.activeTag; },
		set activeTag(value: string | null) { state.activeTag = value; },
		set section(value: WorkspaceSection) { state.section = value; },
		get pendingDelete() { return state.pendingDelete; },
		set pendingDelete(value: Note | null) { state.pendingDelete = value; },
		get deleteOpen() { return state.deleteOpen; },
		set deleteOpen(value: boolean) { state.deleteOpen = value; },
		get createOpen() { return state.createOpen; },
		set createOpen(value: boolean) { state.createOpen = value; },
		get confirmDelete() { return settings.confirmDelete; },
		workspaceId: () => workspaceStore.activeId,
		notify: showToast,
	});

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

	const journalOps = createJournalOps({
		items: () => state.items,
		addItem: (note) => {
			if (!state.items.some((item) => item.id === note.id)) {
				state.items = [note, ...state.items];
			}
		},
		reveal: () => {
			state.activeFolder = 'all';
			state.activeTag = null;
			state.section = 'notes';
		},
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
	const notificationOps = createNotificationOps(state);
	const addNotification = notificationOps.addNotification;
	const markRead = notificationOps.markRead;
	const markAllRead = notificationOps.markAllRead;
	const clearNotifications = notificationOps.clearNotifications;
	const openAddFolder = () => { state.folderOpen = true; };
	const commitNewFolder = folderOps.commitNew;
	const renameFolder = folderOps.rename;
	const setFolderIcon = folderOps.setIcon;
	const deleteFolder = folderOps.requestDelete;
	const performDeleteFolder = folderOps.performDelete;
	const reorderFolder = folderOps.reorder;

	const updateNote = noteOps.update;

	const deleteNote = noteOps.remove;

	const performDelete = (id: string) => noteOps.performRemove(id);

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
		const [fresh] = await Promise.all([resetNotesToSeed(), notificationOps.resetNotificationsList()]);
		state.items = fresh;
		state.customFolders = [];
		state.selectedId = state.items[0]?.id ?? '';
		state.tasks = [];
		state.activeFolder = 'all';
		state.activeTag = null;
		showToast(t('editor.actions.dataReset'));
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

	/**
	 * Opens Settings, optionally pointing at the section a caller is talking
	 * about — a nudge from the chat lands the user on the setting it explains
	 * rather than one they have to find. An ordinary open passes nothing and
	 * keeps the section from the last visit.
	 */
	function openSettings(section?: SettingsSection) {
		closePanels();
		state.settingsSection = section ?? null;
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
		/**
		 * Journal affordance for the feed, or `undefined` when the feature is off
		 * so the feed renders exactly as before.
		 */
		get journal() {
			return journalOps.feedAffordance();
		},
		openTodayJournal: journalOps.openToday,
		/**
		 * Day navigation for the editor header when the selected note is a
		 * journal entry, else `undefined`.
		 */
		get journalNavigation() {
			return journalOps.navigationFor(selected);
		},
		noteActions,
		showToast,
		changeWorkspace,
		createWorkspaceByName,
		renameWorkspaceById,
		deleteWorkspaceById,
		unsavedWorkspaceRecords,
		createNote,
		commitNewNote,
		importNotes: (notes: { title: string; folder: string; tags: string[]; body: string }[]) =>
			noteOps.importMany(notes),
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
		addNotification,
		closePanels,
		openPalette,
		openSettings,
		selectTask,
		onGlobalKeydown,
	};
}

export type WorkspaceController = ReturnType<typeof createWorkspaceController>;
