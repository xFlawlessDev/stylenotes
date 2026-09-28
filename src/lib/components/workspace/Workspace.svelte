<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { createNote as makeNote } from '$lib/content/content';
	import { createNoteActions } from '$lib/content/note-actions';
	import type { Note } from '$lib/content/content';
	import {
		foldersFor,
		hydrateNotes,
		persistNote,
		persistNotes,
		persistFolders,
		removeNote,
		clearNotes,
		resetNotesToSeed,
		loadFolders,
		listNotes,
		NOTES_CHANGED,
		applyNotePatch,
		uniqueFolderId,
		reorderFolders,
		renameFolderInList,
		setFolderIconInList,
		removeFolderFromList,
		reassignNotesFolder,
		isCustomFolder,
		type CustomFolder,
		type Folder,
		type NotePatch,
		type NotesChangedPayload,
	} from '$lib/stores/notes';
	import {
		settings,
		hydrateSettings,
		toggleMode,
		resetStoredSettings,
	} from '$lib/stores/settings.svelte';
	import {
		loadNotifications,
		persistNotifications,
		resetNotifications,
		type AppNotification,
	} from '$lib/stores/notifications';
	import TitleBar from '$lib/components/workspace/TitleBar.svelte';
	import NotesWorkspace from '$lib/components/workspace/NotesWorkspace.svelte';
	import NotificationPanel from '$lib/components/workspace/NotificationPanel.svelte';
	import WorkspaceOverlays from '$lib/components/workspace/WorkspaceOverlays.svelte';
	import TaskBoard, { type TaskView } from '$lib/components/tasks/TaskBoard.svelte';
	import GraphPage from '$lib/components/graph/GraphPage.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
	import type { WikiClick, WikiEntity, WikiSource } from '$lib/content/wiki-links';
	import { planWikiClick, wikiEntityFor } from '$lib/content/wiki-navigation';
	import type { GraphNode } from '$lib/content/workspace-graph';
	import {
		hydrateTasks,
		refreshTasks,
		clearTasks,
	} from '$lib/stores/tasks.svelte';
	import type { Task } from '$lib/stores/tasks';
	import { isTauri, NAVIGATE_EVENT, openNoteWindow, toggleOverlay, type WorkspaceNavigate, type WorkspaceSection } from '$lib/windows';
	import {
		createWorkspace,
		deleteWorkspace,
		hydrateWorkspaces,
		renameWorkspace,
		setActiveWorkspace,
		WORKSPACES_CHANGED,
		workspaceStore,
	} from '$lib/stores/workspaces.svelte';
	import {
		applyExternalWorkspaces,
		notifyWorkspacesChanged,
		startWorkspaceSync,
		type WorkspacesChangedPayload,
	} from '$lib/workspace-sync.svelte';
	import WorkspaceScope from '$lib/components/workspace/WorkspaceScope.svelte';
	import { dependencyStore, DEPENDENCIES_CHANGED, refreshDependencies } from '$lib/stores/dependencies.svelte';

	let items = $state<Note[]>([]);
	let customFolders = $state<CustomFolder[]>([]);
	let selectedId = $state('');
	let activeFolder = $state('all');
	let activeTag = $state<string | null>(null);
	let paletteOpen = $state(false);
	let settingsOpen = $state(false);
	let notificationsOpen = $state(false);
	let createOpen = $state(false);
	let folderOpen = $state(false);
	let pendingDelete = $state<Note | null>(null);
	let deleteOpen = $state(false);
	let pendingFolder = $state<Folder | null>(null);
	let folderDeleteOpen = $state(false);
	let resetOpen = $state(false);
	let notifications = $state<AppNotification[]>([]);
	let toast = $state('');
	let newNoteToken = $state(0);
	let fullPreview = $state(false);
	let ambiguousEntities = $state<WikiEntity[]>([]);
	let ambiguousHeading = $state<string | null>(null);
	let ambiguousOpen = $state(false);
	let section = $state<WorkspaceSection>('notes');
	let tasks = $state<Task[]>([]);
	let selectedTaskId = $state('');
	let taskView = $state<TaskView>('dashboard');
	let taskFocusToken = $state(0);
	let railOpen = $state(false);
	let feedOpen = $state(false);
	let assistantOpen = $state(false);
	let workspaceLoading = false;

	const folders = $derived(foldersFor(items, customFolders));
	const folderLabelMap = $derived(
		Object.fromEntries(folders.map((folder) => [folder.id, folder.label]))
	);
	const tags = $derived([...new Set(items.flatMap((note) => note.tags))]);
	const visible = $derived.by(() => {
		let list = activeFolder === 'all' ? items : items.filter((note) => note.folder === activeFolder);
		if (activeTag) list = list.filter((note) => note.tags.includes(activeTag!));
		return list;
	});
	const selected = $derived(
		items.find((note) => note.id === selectedId) ?? visible[0] ?? items[0]
	);

	$effect(() => {
		if (activeTag && !tags.includes(activeTag)) activeTag = null;
	});

	onMount(() => {
		void (async () => {
			await hydrateWorkspaces();
			await hydrateSettings();
			const [storedNotes, storedFolders, storedNotifications, storedTasks] = await Promise.all([
				hydrateNotes(),
				loadFolders(),
				loadNotifications(),
				hydrateTasks(),
				refreshDependencies(),
			]);
			items = storedNotes;
			customFolders = storedFolders;
			notifications = storedNotifications;
			tasks = storedTasks;
			if (!selectedId && items.length) selectedId = items[0].id;
		})();

		void startWorkspaceSync();

		let unlisten: (() => void) | undefined;
		let unlistenNotes: (() => void) | undefined;
		let unlistenDependencies: (() => void) | undefined;
		let unlistenWorkspaces: (() => void) | undefined;
		let disposed = false;
		if (isTauri) {
			void listen<WorkspaceNavigate>(NAVIGATE_EVENT, (event) => {
				const payload = event.payload;
				if (!payload) return;
				section = payload.section;
				if (payload.view) taskView = payload.view;
				if (payload.section === 'tasks') {
					if (payload.recordId) selectedTaskId = payload.recordId;
					taskFocusToken += 1;
				}
			}).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			});

			// The Kanban window (and any other window) may switch, create,
			// rename or delete a workspace: reload everything it changed and,
			// when the selection moved, follow it.
			void listen<WorkspacesChangedPayload>(WORKSPACES_CHANGED, (event) => {
				void applyExternalWorkspaces(event.payload).then((activeChanged) => {
					if (activeChanged) void reloadWorkspaceRecords();
				});
			}).then((fn) => {
				if (disposed) fn();
				else unlistenWorkspaces = fn;
			});

			// Quick-captured notes arrive from the dock or a note window; mirror
			// them here unless a local save is still in flight.
			void listen<NotesChangedPayload>(NOTES_CHANGED, (event) => {
				if (event.payload?.source === getCurrentWindow().label) return;
				if (persistTimer) return;
				void listNotes().then((next) => {
					if (persistTimer) return;
					items = next;
					if (!next.some((note) => note.id === selectedId)) {
						selectedId = next[0]?.id ?? '';
					}
				});
			}).then((fn) => {
				if (disposed) fn();
				else unlistenNotes = fn;
			});

			// Dependencies changed in another window (task detail / Kanban).
			void listen(DEPENDENCIES_CHANGED, () => void refreshDependencies()).then((fn) => {
				if (disposed) fn();
				else unlistenDependencies = fn;
			});
		}
		return () => {
			disposed = true;
			unlisten?.();
			unlistenNotes?.();
			unlistenDependencies?.();
			unlistenWorkspaces?.();
		};
	});

	/** Reloads the notes, folders and tasks of the active workspace. */
	async function reloadWorkspaceRecords() {
		const [storedNotes, storedFolders, storedTasks] = await Promise.all([
			listNotes(), loadFolders(), refreshTasks(), refreshDependencies()
		]);
		items = storedNotes;
		customFolders = storedFolders;
		tasks = storedTasks;
		selectedId = items[0]?.id ?? '';
		selectedTaskId = storedTasks[0]?.id ?? '';
		activeFolder = 'all';
		activeTag = null;
		taskFocusToken += 1;
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

	function showToast(message: string) {
		toast = message;
		setTimeout(() => {
			if (toast === message) toast = '';
		}, 2200);
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

	const noteActions = createNoteActions(showToast);

	function createNote() {
		createOpen = true;
	}

	async function persistNoteOrToast(note: Note) {
		const ok = await persistNote(note);
		if (!ok) showToast('Could not save note — changes may be lost');
	}

	async function commitNewNote(data: { title: string; folder: string; body: string }) {
		const note = makeNote({ ...data, workspaceId: workspaceStore.activeId, title: data.title.trim() || 'Untitled note' });
		items = [note, ...items];
		selectedId = note.id;
		activeFolder = data.folder;
		activeTag = null;
		newNoteToken += 1;
		section = 'notes';
		showToast('Note created');
		await persistNoteOrToast(note);
	}

	function showAmbiguous(entities: WikiEntity[], heading: string | null) {
		ambiguousEntities = entities;
		ambiguousHeading = heading;
		ambiguousOpen = entities.length > 0;
	}

	async function selectWikiTarget(entity: WikiEntity, heading: string | null) {
		if (entity.kind === 'task') {
			section = 'tasks';
			taskView = 'list';
			selectedTaskId = entity.id;
			taskFocusToken += 1;
			return;
		}
		section = 'notes';
		activeFolder = 'all';
		activeTag = null;
		selectedId = entity.id;
		if (heading) {
			await tick();
			requestAnimationFrame(() => document.getElementById(heading)?.scrollIntoView());
		}
	}

	async function handleWikiClick(click: WikiClick) {
		const source = items.find((item) => item.id === selectedId);
		if (!source) return;
		await runWikiClick(click, source);
	}

	/**
	 * Wiki click from the AI chat. The chat is global, so there is no open note
	 * to resolve against: a rendered `[[link]]` already carries its target, and
	 * an unresolved one creates the note in the active workspace.
	 */
	async function handleChatWikiClick(click: WikiClick) {
		const source: WikiSource | undefined =
			items.find((item) => item.id === selectedId) ?? items[0] ?? {
				id: '',
				title: '',
				folder: 'personal',
				workspaceId: workspaceStore.activeId
			};
		await runWikiClick(click, source);
	}

	/** Shared wiki-click outcome handling (open / choose / create). */
	async function runWikiClick(click: WikiClick, source: WikiSource) {
		const plan = planWikiClick(click, source, items, customFolders, tasks);
		if (!plan) return;
		if (plan.status === 'open') {
			await selectWikiTarget(plan.entity, plan.heading);
			return;
		}
		if (plan.status === 'choose') {
			showAmbiguous(plan.entities, plan.heading);
			return;
		}
		const created = makeNote({
			title: plan.title,
			folder: plan.folder,
			workspaceId: source.workspaceId ?? workspaceStore.activeId,
		});
		items = [created, ...items];
		const ok = await persistNote(created);
		if (!ok) {
			items = items.filter((item) => item.id !== created.id);
			showToast('Could not create linked note');
			return;
		}
		await selectWikiTarget({ ...created, kind: 'note' }, plan.heading);
	}

	function openGraphNode(node: GraphNode) {
		const entity = wikiEntityFor({ id: node.entityId, kind: node.kind }, items, tasks);
		if (entity) void selectWikiTarget(entity, null);
	}

	function openAddFolder() {
		folderOpen = true;
	}

	function commitNewFolder(label: string, icon?: string) {
		const id = uniqueFolderId(label, folders.map((folder) => folder.id));
		const next = [...customFolders, { id, label, icon }];
		customFolders = next;
		activeFolder = id;
		void persistFolders(next);
		showToast(`Folder “${label}” created`);
	}

	function renameFolder(id: string, label: string) {
		const next = renameFolderInList(customFolders, id, label);
		customFolders = next;
		void persistFolders(next);
		showToast(`Folder renamed to “${label}”`);
	}

	function setFolderIcon(id: string, icon: string) {
		const next = setFolderIconInList(customFolders, id, icon);
		customFolders = next;
		void persistFolders(next);
	}

	function deleteFolder(id: string) {
		if (!isCustomFolder(id)) return;
		pendingFolder = folders.find((folder) => folder.id === id) ?? null;
		folderDeleteOpen = pendingFolder !== null;
	}

	function performDeleteFolder(id: string) {
		if (!isCustomFolder(id)) return;
		const next = removeFolderFromList(customFolders, id);
		customFolders = next;
		void persistFolders(next);
		const remaining = reassignNotesFolder(items, id);
		items = remaining;
		void persistNotes(remaining);
		if (activeFolder === id) activeFolder = 'all';
		showToast('Folder removed');
	}

	function reorderFolder(fromId: string, toId: string) {
		const next = reorderFolders(folders, fromId, toId);
		customFolders = next;
		void persistFolders(next);
	}

	let persistTimer: ReturnType<typeof setTimeout> | null = null;

	function updateNote(id: string, patch: NotePatch) {
		let updated: Note | undefined;
		items = items.map((note) => {
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
		pendingDelete = items.find((note) => note.id === id) ?? null;
		deleteOpen = pendingDelete !== null;
	}

	function performDelete(id: string) {
		items = items.filter((note) => note.id !== id);
		if (selectedId === id) selectedId = items[0]?.id ?? '';
		void removeNote(id);
		showToast('Note deleted');
	}

	function selectFolder(id: string) {
		activeFolder = id;
		activeTag = null;
		const pool = id === 'all' ? items : items.filter((note) => note.folder === id);
		if (!pool.some((note) => note.id === selectedId)) selectedId = pool[0]?.id ?? '';
	}

	function selectTag(tag: string | null) {
		const next = !tag || tag === activeTag ? null : tag;
		activeTag = next;
		const pool = next
			? items.filter(
					(note) => (activeFolder === 'all' || note.folder === activeFolder) && note.tags.includes(next)
				)
			: [];
		if (next && !pool.some((note) => note.id === selectedId)) selectedId = pool[0]?.id ?? '';
	}

	/**
	 * Notes feed quick menu: `archived` mirrors `NoteEditor.toggleArchive`, and
	 * the rest reuse the same handlers as `NoteToolbar` so both paths agree.
	 */
	const ARCHIVE_FOLDER = 'archive';
	const RESTORE_FOLDER = 'personal';

	function toggleArchive(id: string) {
		const note = items.find((item) => item.id === id);
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
		items = fresh;
		customFolders = [];
		selectedId = items[0]?.id ?? '';
		notifications = freshNotifications;
		tasks = [];
		activeFolder = 'all';
		activeTag = null;
		showToast('Data reset to samples');
	}

	function markRead(id: string) {
		notifications = notifications.map((item) =>
			item.id === id ? { ...item, read: true } : item
		);
		void persistNotifications(notifications);
	}

	function closePanels() {
		paletteOpen = false;
		settingsOpen = false;
		notificationsOpen = false;
	}

	function onGlobalKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented) return;
		if (event.key === 'Escape' && fullPreview) {
			fullPreview = false;
			return;
		}
		if (event.key === 'Escape' && assistantOpen) {
			assistantOpen = false;
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
			closePanels();
			paletteOpen = true;
		} else if (key === 'n') {
			event.preventDefault();
			createNote();
		} else if (key === ',') {
			event.preventDefault();
			closePanels();
			settingsOpen = true;
		} else if (key === '/') {
			event.preventDefault();
			toggleMode();
		}
	}
</script>

<svelte:window onkeydown={onGlobalKeydown} />

{#snippet notificationsSlot()}
	<NotificationPanel
		open={notificationsOpen}
		{notifications}
		ontoggle={() => {
			const next = !notificationsOpen;
			closePanels();
			notificationsOpen = next;
		}}
		onread={markRead}
		onreadall={() => {
			notifications = notifications.map((item) => ({ ...item, read: true }));
			void persistNotifications(notifications);
		}}
		onclear={() => {
			notifications = [];
			void persistNotifications([]);
		}}
		onclose={() => (notificationsOpen = false)}
	/>
{/snippet}

<WorkspaceScope>
<div class="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<TitleBar
		workspaceId={workspaceStore.activeId}
		workspaces={workspaceStore.items}
		onworkspacechange={changeWorkspace}
		onworkspacecreate={createWorkspaceByName}
		onworkspacerename={renameWorkspaceById}
		onworkspacedelete={deleteWorkspaceById}
		onpalette={() => {
			closePanels();
			paletteOpen = true;
		}}
		onsettings={() => {
			closePanels();
			settingsOpen = true;
		}}
		mode={settings.mode}
		{section}
		showpanelbuttons={!fullPreview}
		onsection={(next) => {
			section = next;
			fullPreview = false;
		}}
		onopenfolders={() => {
			railOpen = true;
			feedOpen = false;
		}}
		onopennotes={() => {
			feedOpen = true;
			railOpen = false;
		}}
		ontogglemode={toggleMode}
		ontoggledock={toggleOverlay}
		onassistant={() => (assistantOpen = !assistantOpen)}
		notifications={notificationsSlot}
	/>

	{#if section === 'graph'}
		<div class="ws-grid relative flex min-h-0 flex-1">
			<GraphPage
				notes={items}
				{tasks}
				folders={customFolders}
				dependencies={dependencyStore.items}
				onopen={openGraphNode}
			/>
		</div>
	{:else if section === 'tasks'}
		<div class="ws-grid relative flex min-h-0 flex-1">
			<TaskBoard
				bind:tasks
				bind:selectedId={selectedTaskId}
				bind:view={taskView}
				focusToken={taskFocusToken}
				workspaceId={workspaceStore.activeId}
				{folders}
				notes={items}
				onnotify={showToast}
			/>
		</div>
	{:else}
		<NotesWorkspace
			{items}
			{visible}
			{folders}
			{customFolders}
			{folderLabelMap}
			{tags}
			{selected}
			bind:selectedId
			activeFolder={activeFolder}
			{activeTag}
			{tasks}
			{fullPreview}
			newNoteToken={newNoteToken}
			onwikilink={handleWikiClick}
			onchatwikilink={handleChatWikiClick}
			bind:railOpen
			bind:feedOpen
			bind:assistantOpen
			actions={{
				selectfolder: selectFolder,
				selecttag: selectTag,
				newnote: createNote,
				addfolder: openAddFolder,
				renamefolder: renameFolder,
				foldericon: setFolderIcon,
				deletefolder: deleteFolder,
				reorderfolder: reorderFolder,
				selectnote: (id: string) => {
					selectedId = id;
				},
				pin: (id: string) => updateNote(id, { pinned: !items.find((n) => n.id === id)?.pinned }),
				openwindow: openNoteInWindow,
				toggledock: (id: string) =>
					updateNote(id, { overlay: !items.find((n) => n.id === id)?.overlay }),
				togglearchive: toggleArchive,
				printnote: (note: Note) => void noteActions.print(note),
				exportnote: (note: Note) => void noteActions.export(note),
				copynote: (note: Note) => void noteActions.copy(note),
				deletenote: deleteNote,
				updatenote: updateNote,
				togglefullpreview: () => (fullPreview = !fullPreview)
			}}
		/>
	{/if}

	<WorkspaceOverlays
		{toast}
		bind:createOpen
		bind:folderOpen
		bind:deleteOpen
		bind:folderDeleteOpen
		bind:resetOpen
		{paletteOpen}
		onpaletteclose={() => (paletteOpen = false)}
		{items}
		{folders}
		{tasks}
		onselectnote={(id) => {
			selectedId = id;
			section = 'notes';
		}}
		onselecttask={(id) => {
			selectedTaskId = id;
			taskFocusToken += 1;
			section = 'tasks';
		}}
		onselectfolder={selectFolder}
		{settingsOpen}
		onsettingsclose={() => (settingsOpen = false)}
		onexport={() => noteActions.exportAll(items, folders)}
		onresetdata={() => (resetOpen = true)}
		notecount={items.length}
		onnewnote={createNote}
		onnewfolder={openAddFolder}
		ontogglemode={toggleMode}
		onopensettings={() => {
			closePanels();
			settingsOpen = true;
		}}
		onopentasks={() => (section = 'tasks')}
		onopengraph={() => (section = 'graph')}
		oncreatenote={commitNewNote}
		folderLabels={folders.map((folder) => folder.label)}
		oncreatefolder={commitNewFolder}
		{pendingDelete}
		onconfirmdelete={() => {
			if (pendingDelete) performDelete(pendingDelete.id);
			pendingDelete = null;
		}}
		oncanceldelete={() => (pendingDelete = null)}
		{pendingFolder}
		onconfirmfolderdelete={() => {
			if (pendingFolder) performDeleteFolder(pendingFolder.id);
			pendingFolder = null;
		}}
		oncancelfolderdelete={() => (pendingFolder = null)}
		onreset={resetData}
	/>
	<AmbiguousWikiDialog
		bind:open={ambiguousOpen}
		entities={ambiguousEntities}
		heading={ambiguousHeading}
		onselect={(entity, heading) => void selectWikiTarget(entity, heading)}
	/>
</div>
</WorkspaceScope>
