<script lang="ts">
	import { notes as seedNotes, foldersFor, type Note } from '$lib/content/content';
	import TitleBar from '$lib/components/workspace/TitleBar.svelte';
	import VaultRail from '$lib/components/workspace/VaultRail.svelte';
	import NotesFeed from '$lib/components/workspace/NotesFeed.svelte';
	import NoteEditor from '$lib/components/workspace/NoteEditor.svelte';

	let items = $state<Note[]>([...seedNotes]);
	let selectedId = $state(seedNotes[0]?.id ?? '');
	let activeFolder = $state('all');

	const folders = $derived(foldersFor(items));
	const tags = $derived([...new Set(items.flatMap((note) => note.tags))]);
	const visible = $derived(
		activeFolder === 'all' ? items : items.filter((note) => note.folder === activeFolder)
	);
	const selected = $derived(
		items.find((note) => note.id === selectedId) ?? visible[0] ?? items[0]
	);

	function selectFolder(id: string) {
		activeFolder = id;
		const pool = id === 'all' ? items : items.filter((note) => note.folder === id);
		if (!pool.some((note) => note.id === selectedId)) selectedId = pool[0]?.id ?? '';
	}

	function createNote() {
		const id = crypto.randomUUID();
		const note: Note = {
			id,
			title: 'Untitled note',
			folder: activeFolder === 'all' ? 'personal' : activeFolder,
			tags: [],
			updated: 'Just now',
			pinned: false,
			excerpt: 'Start writing. A title worth searching for can wait until the end.',
			body: '',
			words: 0,
			chars: 0,
		};
		items = [note, ...items];
		selectedId = id;
	}

	function updateTitle(id: string, title: string) {
		items = items.map((note) => (note.id === id ? { ...note, title } : note));
	}

	function togglePin(id: string) {
		items = items.map((note) => (note.id === id ? { ...note, pinned: !note.pinned } : note));
	}

	function removeNote(id: string) {
		items = items.filter((note) => note.id !== id);
		if (selectedId === id) selectedId = items[0]?.id ?? '';
	}
</script>

<div class="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<div class="pointer-events-none fixed inset-0 -z-10 backdrop-blur-3xl"></div>

	<TitleBar />

	<div class="flex min-h-0 flex-1 gap-2 p-2.5 pt-2">
		<VaultRail
			{folders}
			{tags}
			active={activeFolder}
			onselect={selectFolder}
			oncreate={createNote}
		/>

		<NotesFeed
			notes={visible}
			{selectedId}
			total={items.length}
			onselect={(id) => (selectedId = id)}
			onpin={togglePin}
			oncreate={createNote}
		/>

		<NoteEditor
			note={selected}
			ontitle={updateTitle}
			onpin={togglePin}
			ondelete={removeNote}
		/>
	</div>
</div>