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
	import { notes as seedNotes, buildExcerpt, countWords, createNote as makeNote } from '$lib/content/content';
	import type { Note } from '$lib/content/content';
	import {
		foldersFor,
		loadNotes,
		saveNotes,
		clearNotes,
		exportNotes,
		loadFolders,
		saveFolders,
		uniqueFolderId,
		type CustomFolder,
	} from '$lib/stores/notes';
	import {
		settings,
		hydrateSettings,
		toggleMode,
	} from '$lib/stores/settings.svelte';
	import {
		loadNotifications,
		saveNotifications,
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

	let items = $state<Note[]>(loadNotes());
	let customFolders = $state<CustomFolder[]>(loadFolders());
	let selectedId = $state('');
	let activeFolder = $state('all');
	let paletteOpen = $state(false);
	let settingsOpen = $state(false);
	let notificationsOpen = $state(false);
	let createOpen = $state(false);
	let folderOpen = $state(false);
	let pendingDelete = $state<Note | null>(null);
	let deleteOpen = $state(false);
	let resetOpen = $state(false);
	let notifications = $state<AppNotification[]>(loadNotifications());
	let toast = $state('');

	const folders = $derived(foldersFor(items, customFolders));
	const tags = $derived([...new Set(items.flatMap((note) => note.tags))]);
	const visible = $derived(
		activeFolder === 'all' ? items : items.filter((note) => note.folder === activeFolder)
	);
	const selected = $derived(
		items.find((note) => note.id === selectedId) ?? visible[0] ?? items[0]
	);

	$effect(() => {
		saveNotes(items);
	});

	$effect(() => {
		saveFolders(customFolders);
	});

	$effect(() => {
		saveNotifications(notifications);
	});

	onMount(() => {
		hydrateSettings();
		if (!selectedId && items.length) selectedId = items[0].id;
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

	function commitNewNote(data: { title: string; folder: string; body: string }) {
		const note = makeNote(data);
		items = [note, ...items];
		selectedId = note.id;
		activeFolder = data.folder;
		showToast('Note created');
	}

	function openAddFolder() {
		folderOpen = true;
	}

	function commitNewFolder(label: string) {
		const id = uniqueFolderId(label, folders.map((folder) => folder.id));
		customFolders = [...customFolders, { id, label }];
		activeFolder = id;
		showToast(`Folder “${label}” created`);
	}

	function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'folder' | 'pinned'>>) {
		items = items.map((note) => {
			if (note.id !== id) return note;
			const next: Note = { ...note, ...patch, updated: 'Just now' };
			if (patch.body !== undefined) {
				next.words = countWords(patch.body);
				next.chars = patch.body.length;
				next.excerpt = buildExcerpt(patch.body);
			}
			return next;
		});
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
		showToast('Note deleted');
	}

	function selectFolder(id: string) {
		activeFolder = id;
		const pool = id === 'all' ? items : items.filter((note) => note.folder === id);
		if (!pool.some((note) => note.id === selectedId)) selectedId = pool[0]?.id ?? '';
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

	function resetData() {
		clearNotes();
		items = [...seedNotes];
		customFolders = [];
		selectedId = items[0]?.id ?? '';
		notifications = resetNotifications();
		activeFolder = 'all';
		showToast('Data reset to samples');
	}

	function markRead(id: string) {
		notifications = notifications.map((item) =>
			item.id === id ? { ...item, read: true } : item
		);
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
		}}
		onclear={() => (notifications = [])}
		onclose={() => (notificationsOpen = false)}
	/>
{/snippet}

<div class="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<TitleBar
		onpalette={() => {
			closePanels();
			paletteOpen = true;
		}}
		oncreate={createNote}
		onsettings={() => {
			closePanels();
			settingsOpen = true;
		}}
		mode={settings.mode}
		ontogglemode={toggleMode}
		notifications={notificationsSlot}
	/>

	<div class="ws-grid relative flex min-h-0 flex-1">
		<VaultRail
			{folders}
			{tags}
			active={activeFolder}
			onselect={selectFolder}
			oncreate={createNote}
			onaddfolder={openAddFolder}
		/>

		<NotesFeed
			notes={visible}
			{selectedId}
			total={items.length}
			onselect={(id) => (selectedId = id)}
			onpin={(id) => updateNote(id, { pinned: !items.find((n) => n.id === id)?.pinned })}
			oncreate={createNote}
		/>

		<NoteEditor
			note={selected}
			{folders}
			onupdate={updateNote}
			ondelete={deleteNote}
			onshare={shareNote}
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
		onncreatenote={createNote}
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