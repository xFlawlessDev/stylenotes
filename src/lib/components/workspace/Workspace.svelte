<script lang="ts">
	import { onMount } from 'svelte';
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
	import VaultRail from '$lib/components/workspace/VaultRail.svelte';
	import NotesFeed from '$lib/components/workspace/NotesFeed.svelte';
	import NoteEditor from '$lib/components/workspace/NoteEditor.svelte';
	import NotificationPanel from '$lib/components/workspace/NotificationPanel.svelte';
	import WorkspaceOverlays from '$lib/components/workspace/WorkspaceOverlays.svelte';
	import TaskBoard, { type TaskView } from '$lib/components/tasks/TaskBoard.svelte';
	import {
		hydrateTasks,
		clearTasks,
	} from '$lib/stores/tasks.svelte';
	import type { Task } from '$lib/stores/tasks';
	import { isTauri, NAVIGATE_EVENT, toggleOverlay, type WorkspaceNavigate } from '$lib/windows';

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
	let section = $state<'notes' | 'tasks'>('notes');
	let tasks = $state<Task[]>([]);
	let selectedTaskId = $state('');
	let taskView = $state<TaskView>('kanban');
	let taskFocusToken = $state(0);
	let railOpen = $state(false);
	let feedOpen = $state(false);

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
		void hydrateSettings();
		void (async () => {
			const [storedNotes, storedFolders, storedNotifications, storedTasks] = await Promise.all([
				hydrateNotes(),
				loadFolders(),
				loadNotifications(),
				hydrateTasks(),
			]);
			items = storedNotes;
			customFolders = storedFolders;
			notifications = storedNotifications;
			tasks = storedTasks;
			if (!selectedId && items.length) selectedId = items[0].id;
		})();

		let unlisten: (() => void) | undefined;
		let unlistenNotes: (() => void) | undefined;
		let disposed = false;
		if (isTauri) {
			void listen<WorkspaceNavigate>(NAVIGATE_EVENT, (event) => {
				const payload = event.payload;
				if (!payload) return;
				section = payload.section;
				if (payload.view) taskView = payload.view;
				if (payload.section === 'tasks') taskFocusToken += 1;
			}).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
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
		}
		return () => {
			disposed = true;
			unlisten?.();
			unlistenNotes?.();
		};
	});

	function showToast(message: string) {
		toast = message;
		setTimeout(() => {
			if (toast === message) toast = '';
		}, 2200);
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
		const note = makeNote({ ...data, title: data.title.trim() || 'Untitled note' });
		items = [note, ...items];
		selectedId = note.id;
		activeFolder = data.folder;
		activeTag = null;
		newNoteToken += 1;
		showToast('Note created');
		await persistNoteOrToast(note);
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

<div class="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<TitleBar
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
		notifications={notificationsSlot}
	/>

	{#if section === 'tasks'}
		<div class="ws-grid relative flex min-h-0 flex-1">
			<TaskBoard
				bind:tasks
				bind:selectedId={selectedTaskId}
				bind:view={taskView}
				focusToken={taskFocusToken}
				{folders}
				notes={items}
				onnotify={showToast}
			/>
		</div>
	{:else}
		<div class="ws-grid relative flex min-h-0 flex-1">
			{#if railOpen}
				<button
					class="fixed inset-0 z-30 cursor-default bg-scrim/40 lg:hidden"
					aria-label="Close folders"
					onclick={() => (railOpen = false)}
				></button>
			{/if}
			{#if feedOpen}
				<button
					class="fixed inset-0 z-30 cursor-default bg-scrim/40 md:hidden"
					aria-label="Close notes list"
					onclick={() => (feedOpen = false)}
				></button>
			{/if}
			{#if !fullPreview}
				<VaultRail
					{folders}
					{tags}
					active={activeFolder}
					{activeTag}
					open={railOpen}
					onclose={() => (railOpen = false)}
					onselect={(id) => {
						selectFolder(id);
						feedOpen = true;
					}}
					oncreate={createNote}
					onaddfolder={openAddFolder}
					onrenamefolder={renameFolder}
					onfoldericon={setFolderIcon}
					ondeletedfolder={deleteFolder}
					onreorder={reorderFolder}
					onselecttag={selectTag}
				/>

				<NotesFeed
					notes={visible}
					{selectedId}
					total={items.length}
					folderLabel={activeFolder === 'all' ? 'All Notes' : (folders.find((folder) => folder.id === activeFolder)?.label ?? activeFolder)}
					resetToken={newNoteToken}
					showFolder={activeFolder === 'all'}
					folderLabels={folderLabelMap}
					{activeTag}
					open={feedOpen}
					onclose={() => (feedOpen = false)}
					onselect={(id) => {
						selectedId = id;
						feedOpen = false;
					}}
					onpin={(id) => updateNote(id, { pinned: !items.find((n) => n.id === id)?.pinned })}
					onselecttag={selectTag}
					oncleartag={() => selectTag(null)}
					onselectfolder={selectFolder}
				/>
			{/if}

			<NoteEditor
				note={selected}
				{folders}
				focusToken={newNoteToken}
				{fullPreview}
				ontogglefullpreview={() => (fullPreview = !fullPreview)}
				onupdate={updateNote}
				ondelete={deleteNote}
				onprint={noteActions.print}
				onexport={noteActions.export}
				oncopy={noteActions.copy}
				onselectfolder={selectFolder}
			/>
		</div>
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
		onselectnote={(id) => (selectedId = id)}
		onselecttask={(id) => {
			selectedTaskId = id;
			taskFocusToken += 1;
			section = 'tasks';
		}}
		onselectfolder={selectFolder}
		{settingsOpen}
		onsettingsclose={() => (settingsOpen = false)}
		onexport={() => noteActions.exportAll(items)}
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
</div>