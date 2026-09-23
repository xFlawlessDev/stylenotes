<script lang="ts">
	import {
		FilePlus2,
		FolderPlus,
		Settings as SettingsIcon,
		Contrast,
		Download,
		ListTodo,
		Network,
		Trash2,
		RotateCcw,
	} from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import type { Task } from '$lib/stores/tasks';
	import CommandPalette from '$lib/components/workspace/CommandPalette.svelte';
	import SettingsPanel from '$lib/components/workspace/SettingsPanel.svelte';
	import CreateNoteDialog from '$lib/components/dialogs/CreateNoteDialog.svelte';
	import AddFolderDialog from '$lib/components/dialogs/AddFolderDialog.svelte';
	import ConfirmDialog from '$lib/components/dialogs/ConfirmDialog.svelte';

	let {
		toast = '',
		items,
		folders,
		tasks,
		paletteOpen = false,
		onpaletteclose,
		onselectnote,
		onselecttask,
		onselectfolder,
		settingsOpen = false,
		onsettingsclose,
		onexport,
		onresetdata,
		notecount,
		onnewnote,
		onnewfolder,
		ontogglemode,
		onopensettings,
		onopentasks,
		onopengraph,
		createOpen = $bindable(false),
		oncreatenote,
		folderOpen = $bindable(false),
		folderLabels = [],
		oncreatefolder,
		deleteOpen = $bindable(false),
		pendingDelete = null,
		onconfirmdelete,
		oncanceldelete,
		folderDeleteOpen = $bindable(false),
		pendingFolder = null,
		onconfirmfolderdelete,
		oncancelfolderdelete,
		resetOpen = $bindable(false),
		onreset,
	}: {
		toast?: string;
		items: Note[];
		folders: Folder[];
		tasks: Task[];
		paletteOpen?: boolean;
		onpaletteclose: () => void;
		onselectnote: (id: string) => void;
		onselecttask: (id: string) => void;
		onselectfolder: (id: string) => void;
		settingsOpen?: boolean;
		onsettingsclose: () => void;
		onexport: () => void;
		onresetdata: () => void;
		notecount: number;
		onnewnote: () => void;
		onnewfolder: () => void;
		ontogglemode: () => void;
		onopensettings: () => void;
		onopentasks: () => void;
		onopengraph: () => void;
		createOpen?: boolean;
		oncreatenote: (data: { title: string; folder: string; body: string }) => void;
		folderOpen?: boolean;
		folderLabels?: string[];
		oncreatefolder: (label: string) => void;
		deleteOpen?: boolean;
		pendingDelete?: Note | null;
		onconfirmdelete: () => void;
		oncanceldelete: () => void;
		folderDeleteOpen?: boolean;
		pendingFolder?: Folder | null;
		onconfirmfolderdelete: () => void;
		oncancelfolderdelete: () => void;
		resetOpen?: boolean;
		onreset: () => void;
	} = $props();

	const actions = $derived([
		{ id: 'new', label: 'New note', hint: 'Ctrl N', icon: FilePlus2, run: onnewnote },
		{ id: 'new-folder', label: 'New folder', icon: FolderPlus, run: onnewfolder },
		{ id: 'tasks', label: 'Open tasks', icon: ListTodo, run: onopentasks },
		{ id: 'graph', label: 'Open graph', icon: Network, run: onopengraph },
		{ id: 'theme', label: 'Toggle light and dark', hint: 'Ctrl /', icon: Contrast, run: ontogglemode },
		{ id: 'settings', label: 'Open settings', hint: 'Ctrl ,', icon: SettingsIcon, run: onopensettings },
		{ id: 'export', label: 'Export all notes', icon: Download, run: onexport },
	]);

	const folderDeleteDescription = $derived(
		`The folder “${pendingFolder?.label ?? ''}” will be removed. Its ${
			(pendingFolder?.count ?? 0) === 1 ? 'note' : 'notes'
		} will move to Personal. This action cannot be undone.`
	);
</script>

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
	{tasks}
	{folders}
	{actions}
	onselectnote={(id) => {
		onselectnote(id);
		onpaletteclose();
	}}
	onselecttask={(id) => {
		onselecttask(id);
		onpaletteclose();
	}}
	onselectfolder={(id) => {
		onselectfolder(id);
		onpaletteclose();
	}}
	onclose={onpaletteclose}
/>

<SettingsPanel
	open={settingsOpen}
	onclose={onsettingsclose}
	onexport={onexport}
	onresetdata={onresetdata}
	{notecount}
/>

<CreateNoteDialog bind:open={createOpen} {folders} onsubmit={oncreatenote} />

<AddFolderDialog bind:open={folderOpen} labels={folderLabels} onsubmit={oncreatefolder} />

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete this note?"
	description="This permanently removes the note and its content. This action cannot be undone."
	confirmLabel="Delete note"
	confirmVariant="danger"
	onconfirm={onconfirmdelete}
	oncancel={oncanceldelete}
>
	{#snippet icon()}
		<Trash2 size={18} />
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={folderDeleteOpen}
	title="Delete this folder?"
	description={folderDeleteDescription}
	confirmLabel="Delete folder"
	confirmVariant="danger"
	onconfirm={onconfirmfolderdelete}
	oncancel={oncancelfolderdelete}
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
	confirmVariant="danger"
	onconfirm={onreset}
>
	{#snippet icon()}
		<RotateCcw size={18} />
	{/snippet}
</ConfirmDialog>