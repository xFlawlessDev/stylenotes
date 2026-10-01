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
	import type { SettingsSection } from '$lib/content/settings-sections';
	import { t } from '$lib/i18n/index.svelte';
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
		settingsSection = null,
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
		existingTitles = new Set<string>(),
		onimportnotes,
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
		/** Section Settings should land on, when a caller names one. */
		settingsSection?: SettingsSection | null;
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
		existingTitles?: Set<string>;
		onimportnotes?: (
			notes: { title: string; folder: string; tags: string[]; body: string }[]
		) => Promise<boolean>;
	} = $props();

	const actions = $derived([
		{ id: 'new', label: t('palette.action.newNote'), hint: 'Ctrl N', icon: FilePlus2, run: onnewnote },
		{ id: 'new-folder', label: t('palette.action.newFolder'), icon: FolderPlus, run: onnewfolder },
		{ id: 'tasks', label: t('palette.action.openTasks'), icon: ListTodo, run: onopentasks },
		{ id: 'graph', label: t('palette.action.openGraph'), icon: Network, run: onopengraph },
		{ id: 'theme', label: t('palette.action.toggleTheme'), hint: 'Ctrl /', icon: Contrast, run: ontogglemode },
		{ id: 'settings', label: t('palette.action.openSettings'), hint: 'Ctrl ,', icon: SettingsIcon, run: onopensettings },
		{ id: 'export', label: t('palette.action.export'), icon: Download, run: onexport },
	]);

	const folderDeleteDescription = $derived(
		t('dialogs.deleteFolder.description', {
			name: pendingFolder?.label ?? '',
			items:
				(pendingFolder?.count ?? 0) === 1
					? t('dialogs.deleteFolder.itemOne')
					: t('dialogs.deleteFolder.itemMany'),
		})
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
	initialSection={settingsSection}
	onclose={onsettingsclose}
	onexport={onexport}
	onresetdata={onresetdata}
	{notecount}
	{existingTitles}
	{onimportnotes}
/>

<CreateNoteDialog bind:open={createOpen} {folders} onsubmit={oncreatenote} />

<AddFolderDialog bind:open={folderOpen} labels={folderLabels} onsubmit={oncreatefolder} />

<ConfirmDialog
	bind:open={deleteOpen}
	title={t('dialogs.deleteNote.title')}
	description={t('dialogs.deleteNote.description')}
	confirmLabel={t('dialogs.deleteNote.confirm')}
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
	title={t('dialogs.deleteFolder.title')}
	description={folderDeleteDescription}
	confirmLabel={t('dialogs.deleteFolder.confirm')}
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
	title={t('dialogs.resetData.title')}
	description={t('dialogs.resetData.description')}
	confirmLabel={t('dialogs.resetData.confirm')}
	confirmVariant="danger"
	onconfirm={onreset}
>
	{#snippet icon()}
		<RotateCcw size={18} />
	{/snippet}
</ConfirmDialog>