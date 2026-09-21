<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Search,
		FilePlus2,
		FolderPlus,
		Settings as SettingsIcon,
		Contrast,
		Pin,
		Download,
	} from '@lucide/svelte';
	import { buildExcerpt, countWords, createNote as makeNote } from '$lib/content/content';
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
		exportNotes,
		loadFolders,
		uniqueFolderId,
		reorderFolders,
		renameFolderInList,
		setFolderIconInList,
		removeFolderFromList,
		reassignNotesFolder,
		isCustomFolder,
		type CustomFolder,
		type Folder,
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
	import CommandPalette from '$lib/components/workspace/CommandPalette.svelte';
	import NotificationPanel from '$lib/components/workspace/NotificationPanel.svelte';
	import SettingsPanel from '$lib/components/workspace/SettingsPanel.svelte';
	import CreateNoteDialog from '$lib/components/dialogs/CreateNoteDialog.svelte';
	import AddFolderDialog from '$lib/components/dialogs/AddFolderDialog.svelte';
	import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';
	import { Trash2, RotateCcw } from '@lucide/svelte';
	import { toggleOverlay } from '$lib/windows';

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
			const [storedNotes, storedFolders, storedNotifications] = await Promise.all([
				hydrateNotes(),
				loadFolders(),
				loadNotifications(),
			]);
			items = storedNotes;
			customFolders = storedFolders;
			notifications = storedNotifications;
			if (!selectedId && items.length) selectedId = items[0].id;
		})();
	});

	function showToast(message: string) {
		toast = message;
		setTimeout(() => {
			if (toast === message) toast = '';
		}, 2200);
	}

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

	function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder' | 'pinned'>>) {
		let updated: Note | undefined;
		items = items.map((note) => {
			if (note.id !== id) return note;
			const next: Note = { ...note, ...patch, updated: 'Just now' };
			if (patch.body !== undefined) {
				next.words = countWords(patch.body);
				next.chars = patch.body.length;
				next.excerpt = buildExcerpt(patch.body);
			}
			updated = next;
			return next;
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

	async function shareNote(note: Note) {
		const text = `${note.title}\n\n${note.body}`;
		try {
			await navigator.clipboard.writeText(text);
			showToast('Note copied to clipboard');
		} catch {
			showToast('Could not copy note');
		}
	}

	function exportAll() {
		const blob = new Blob([exportNotes(items)], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'stylenotes.md';
		link.click();
		URL.revokeObjectURL(url);
		showToast('Exported notes');
	}

	function askResetData() {
		resetOpen = true;
	}

	async function resetData() {
		await clearNotes();
		await resetStoredSettings();
		const [fresh, freshNotifications] = await Promise.all([
			resetNotesToSeed(),
			resetNotifications(),
		]);
		items = fresh;
		customFolders = [];
		selectedId = items[0]?.id ?? '';
		notifications = freshNotifications;
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

	const actions = [
		{
			id: 'new',
			label: 'New note',
			hint: 'Ctrl N',
			icon: FilePlus2,
			run: createNote,
		},
		{
			id: 'new-folder',
			label: 'New folder',
			icon: FolderPlus,
			run: openAddFolder,
		},
		{
			id: 'theme',
			label: 'Toggle light and dark',
			hint: 'Ctrl /',
			icon: Contrast,
			run: toggleMode,
		},
		{
			id: 'settings',
			label: 'Open settings',
			hint: 'Ctrl ,',
			icon: SettingsIcon,
			run: () => (settingsOpen = true),
		},
		{
			id: 'export',
			label: 'Export all notes',
			icon: Download,
			run: exportAll,
		},
		{
			id: 'pinned',
			label: 'Show pinned notes',
			icon: Pin,
			run: () => (activeFolder = 'all'),
		},
	];

	function onGlobalKeydown(event: KeyboardEvent) {
		const mod = event.ctrlKey || event.metaKey;
		if (!mod) return;
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
		ontogglemode={toggleMode}
		ontoggledock={toggleOverlay}
		notifications={notificationsSlot}
	/>

	<div class="ws-grid relative flex min-h-0 flex-1">
		<VaultRail
			{folders}
			{tags}
			active={activeFolder}
			{activeTag}
			onselect={selectFolder}
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
			onselect={(id) => (selectedId = id)}
			onpin={(id) => updateNote(id, { pinned: !items.find((n) => n.id === id)?.pinned })}
			onselecttag={selectTag}
			oncleartag={() => selectTag(null)}
			onselectfolder={selectFolder}
		/>

		<NoteEditor
			note={selected}
			{folders}
			focusToken={newNoteToken}
			onupdate={updateNote}
			ondelete={deleteNote}
			onshare={shareNote}
			onselectfolder={selectFolder}
		/>
	</div>

	{#if toast}
		<div
			class="glass-solid pointer-events-none fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-label-md font-label text-on-surface"
		>
			{toast}
		</div>
	{/if}

	<CommandPalette
		open={paletteOpen}
		notes={items}
		{folders}
		{actions}
		onselectnote={(id) => (selectedId = id)}
		onselectfolder={selectFolder}
		onclose={() => (paletteOpen = false)}
	/>

	<SettingsPanel
		open={settingsOpen}
		onclose={() => (settingsOpen = false)}
		onexport={exportAll}
		onresetdata={askResetData}
		notecount={items.length}
	/>

	<CreateNoteDialog bind:open={createOpen} {folders} onsubmit={commitNewNote} />

	<AddFolderDialog
		bind:open={folderOpen}
		labels={folders.map((folder) => folder.label)}
		onsubmit={commitNewFolder}
	/>

	<ConfirmDialog
		bind:open={deleteOpen}
		title="Delete this note?"
		description="This permanently removes the note and its content. This action cannot be undone."
		confirmLabel="Delete note"
		confirmVariant="destructive"
		onconfirm={() => {
			if (pendingDelete) performDelete(pendingDelete.id);
			pendingDelete = null;
		}}
		oncancel={() => (pendingDelete = null)}
	>
		{#snippet icon()}
			<Trash2 size={18} />
		{/snippet}
	</ConfirmDialog>

	<ConfirmDialog
		bind:open={folderDeleteOpen}
		title="Delete this folder?"
		description="The folder “{pendingFolder?.label ?? ''}” will be removed. Its {(pendingFolder?.count ??
		0) === 1
			? 'note'
			: 'notes'} will move to Personal. This action cannot be undone."
		confirmLabel="Delete folder"
		confirmVariant="destructive"
		onconfirm={() => {
			if (pendingFolder) performDeleteFolder(pendingFolder.id);
			pendingFolder = null;
		}}
		oncancel={() => (pendingFolder = null)}
	>
		{#snippet icon()}
			<Trash2 size={18} />
		{/snippet}
	</ConfirmDialog>

	<ConfirmDialog
		bind:open={resetOpen}
		title="Reset all data?"
		description="Restores the sample notes and clears your local changes and preferences."
		confirmLabel="Reset everything"
		confirmVariant="destructive"
		onconfirm={resetData}
	>
		{#snippet icon()}
			<RotateCcw size={18} />
		{/snippet}
	</ConfirmDialog>
</div>