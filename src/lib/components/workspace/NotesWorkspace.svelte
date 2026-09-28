<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import type { CustomFolder } from '$lib/stores/notes';
	import type { Task } from '$lib/stores/tasks';
	import type { WikiClick } from '$lib/content/wiki-links';
	import VaultRail from '$lib/components/workspace/VaultRail.svelte';
	import NotesFeed from '$lib/components/workspace/NotesFeed.svelte';
	import NoteEditor from '$lib/components/workspace/NoteEditor.svelte';
	import AiChatPanel from '$lib/components/workspace/AiChatPanel.svelte';

	/**
	 * The notes section of the workspace: the folder rail, the notes feed and
	 * the editor (with the optional AI chat panel). It owns the small-screen
	 * drawer state so `Workspace.svelte` stays about coordination.
	 *
	 * Callbacks are grouped in `actions` to keep the prop list readable; the
	 * note-taking callbacks take the same shapes the child components expect.
	 */
	let {
		visible,
		items,
		folders,
		customFolders,
		folderLabelMap,
		tags,
		selected,
		selectedId = $bindable(''),
		activeFolder,
		activeTag,
		tasks,
		fullPreview = false,
		newNoteToken = 0,
		onwikilink,
		railOpen = $bindable(false),
		feedOpen = $bindable(false),
		assistantOpen = $bindable(false),
		actions
	}: {
		visible: Note[];
		items: Note[];
		folders: Folder[];
		customFolders: CustomFolder[];
		folderLabelMap: Record<string, string>;
		tags: string[];
		selected?: Note;
		selectedId?: string;
		activeFolder: string;
		activeTag: string | null;
		tasks: Task[];
		fullPreview?: boolean;
		newNoteToken?: number;
		onwikilink?: (click: WikiClick) => void;
		railOpen?: boolean;
		feedOpen?: boolean;
		assistantOpen?: boolean;
		actions: {
			selectfolder: (id: string) => void;
			selecttag: (tag: string | null) => void;
			newnote: () => void;
			addfolder: () => void;
			renamefolder: (id: string, label: string) => void;
			foldericon: (id: string, icon: string) => void;
			deletefolder: (id: string) => void;
			reorderfolder: (fromId: string, toId: string) => void;
			selectnote: (id: string) => void;
			pin: (id: string) => void;
			openwindow: (id: string) => void;
			toggledock: (id: string) => void;
			togglearchive: (id: string) => void;
			printnote: (note: Note) => void;
			exportnote: (note: Note) => void;
			copynote: (note: Note) => void;
			deletenote: (id: string) => void;
			updatenote: (id: string, patch: Partial<Note>) => void;
			togglefullpreview: () => void;
		};
	} = $props();

	const folderLabel = $derived(
		activeFolder === 'all'
			? 'All Notes'
			: (folders.find((folder) => folder.id === activeFolder)?.label ?? activeFolder)
	);

	/** The feed hands back an id; note actions want the record. */
	function runById(id: string, action: (note: Note) => void) {
		const note = items.find((item) => item.id === id);
		if (note) action(note);
	}
</script>

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
				actions.selectfolder(id);
				feedOpen = true;
			}}
			oncreate={actions.newnote}
			onaddfolder={actions.addfolder}
			onrenamefolder={actions.renamefolder}
			onfoldericon={actions.foldericon}
			ondeletedfolder={actions.deletefolder}
			onreorder={actions.reorderfolder}
			onselecttag={actions.selecttag}
		/>

		<NotesFeed
			notes={visible}
			selectedId={selectedId}
			total={items.length}
			{folderLabel}
			resetToken={newNoteToken}
			showFolder={activeFolder === 'all'}
			folderLabels={folderLabelMap}
			{activeTag}
			open={feedOpen}
			onclose={() => (feedOpen = false)}
			onselect={actions.selectnote}
			onpin={actions.pin}
			onselecttag={actions.selecttag}
			oncleartag={() => actions.selecttag(null)}
			onselectfolder={actions.selectfolder}
			onopenwindow={actions.openwindow}
			ontoggledock={actions.toggledock}
			ontogglearchive={actions.togglearchive}
			onprint={(id) => runById(id, actions.printnote)}
			onexport={(id) => runById(id, actions.exportnote)}
			oncopy={(id) => runById(id, actions.copynote)}
			ondelete={actions.deletenote}
		/>
	{/if}

	{#if assistantOpen}
		<AiChatPanel
			open={assistantOpen}
			notes={items}
			tasks={tasks.map((task) => ({
				id: task.id,
				title: task.title,
				folder: task.folder,
				workspaceId: task.workspaceId,
				body: task.notes
			}))}
			workspaceId={selected?.workspaceId}
			onclose={() => (assistantOpen = false)}
		/>
	{/if}

	<NoteEditor
		note={selected}
		notes={items}
		{tasks}
		{customFolders}
		{onwikilink}
		{folders}
		focusToken={newNoteToken}
		{fullPreview}
		ontogglefullpreview={actions.togglefullpreview}
		onupdate={actions.updatenote}
		ondelete={actions.deletenote}
		onprint={actions.printnote}
		onexport={actions.exportnote}
		oncopy={actions.copynote}
		onselectfolder={actions.selectfolder}
	/>
</div>
