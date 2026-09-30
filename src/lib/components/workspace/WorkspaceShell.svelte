<script lang="ts">
	import type { Snippet } from 'svelte';
	import TitleBar from '$lib/components/workspace/TitleBar.svelte';
	import NotesWorkspace from '$lib/components/workspace/NotesWorkspace.svelte';
	import TaskBoard from '$lib/components/tasks/TaskBoard.svelte';
	import GraphPage from '$lib/components/graph/GraphPage.svelte';
	import AiChatPanel from '$lib/components/workspace/AiChatPanel.svelte';
	import { toggleOverlay, type WorkspaceSection } from '$lib/windows';
	import { workspaceStore } from '$lib/stores/workspaces.svelte';
	import { toggleMode, type ThemeMode } from '$lib/stores/settings.svelte';
	import type { TaskDependency } from '$lib/stores/tasks';
	import type { WorkspaceController } from '$lib/stores/workspace-controller.svelte';

	let {
		controller,
		mode,
		dependencies,
		notifications,
	}: {
		controller: WorkspaceController;
		mode: ThemeMode;
		dependencies: TaskDependency[];
		notifications: Snippet;
	} = $props();

	const state = $derived(controller.state);
</script>

<TitleBar
	workspaceId={workspaceStore.activeId}
	workspaces={workspaceStore.items}
	onworkspacechange={controller.changeWorkspace}
	onworkspacecreate={controller.createWorkspaceByName}
	onworkspacerename={controller.renameWorkspaceById}
	onworkspacedelete={controller.deleteWorkspaceById}
	onworkspaceunsaved={controller.unsavedWorkspaceRecords}
	onpalette={controller.openPalette}
	onsettings={controller.openSettings}
	{mode}
	section={state.section}
	showpanelbuttons={!state.fullPreview}
	onsection={(next: WorkspaceSection) => {
		state.section = next;
		state.fullPreview = false;
	}}
	onopenfolders={() => {
		state.railOpen = true;
		state.feedOpen = false;
	}}
	onopennotes={() => {
		state.feedOpen = true;
		state.railOpen = false;
	}}
	ontogglemode={toggleMode}
	ontoggledock={toggleOverlay}
	onassistant={() => (state.assistantOpen = !state.assistantOpen)}
	{notifications}
/>

{#if state.section === 'graph'}
	<div class="ws-grid relative flex min-h-0 flex-1">
		<GraphPage
			notes={state.items}
			tasks={state.tasks}
			folders={state.customFolders}
			{dependencies}
			onopen={controller.openGraphNode}
		/>
	</div>
{:else if state.section === 'tasks'}
	<div class="ws-grid relative flex min-h-0 flex-1">
		<TaskBoard
			bind:tasks={state.tasks}
			bind:selectedId={state.selectedTaskId}
			bind:view={state.taskView}
			focusToken={state.taskFocusToken}
			workspaceId={workspaceStore.activeId}
			folders={controller.folders}
			notes={state.items}
			onnotify={controller.showToast}
		/>
	</div>
{:else}
	<NotesWorkspace
		items={state.items}
		visible={controller.visible}
		folders={controller.folders}
		customFolders={state.customFolders}
		folderLabelMap={controller.folderLabelMap}
		tags={controller.tags}
		selected={controller.selected}
		bind:selectedId={state.selectedId}
		activeFolder={state.activeFolder}
		activeTag={state.activeTag}
		tasks={state.tasks}
		fullPreview={state.fullPreview}
		newNoteToken={state.newNoteToken}
		journal={controller.journal}
		journalNavigation={controller.journalNavigation}
		onwikilink={controller.handleWikiClick}
		bind:railOpen={state.railOpen}
		bind:feedOpen={state.feedOpen}
		actions={{
			selectfolder: controller.selectFolder,
			selecttag: controller.selectTag,
			newnote: controller.createNote,
			addfolder: controller.openAddFolder,
			renamefolder: controller.renameFolder,
			foldericon: controller.setFolderIcon,
			deletefolder: controller.deleteFolder,
			reorderfolder: controller.reorderFolder,
			selectnote: (id: string) => {
				state.selectedId = id;
			},
			pin: (id: string) =>
				controller.updateNote(id, {
					pinned: !state.items.find((n) => n.id === id)?.pinned,
				}),
			openwindow: controller.openNoteInWindow,
			toggledock: (id: string) =>
				controller.updateNote(id, {
					overlay: !state.items.find((n) => n.id === id)?.overlay,
				}),
			togglearchive: controller.toggleArchive,
			printnote: (note) => void controller.noteActions.print(note),
			exportnote: (note) => void controller.noteActions.export(note),
			copynote: (note) => void controller.noteActions.copy(note),
			deletenote: controller.deleteNote,
			updatenote: controller.updateNote,
			togglefullpreview: () => (state.fullPreview = !state.fullPreview),
		}}
	/>
{/if}

<!-- Hosted at the shell so the assistant overlays notes, tasks and the graph
     alike; `onclose` only closes it, wikilinks route through the controller. -->
<AiChatPanel
	open={state.assistantOpen}
	notes={state.items}
	tasks={state.tasks.map((task) => ({
		id: task.id,
		title: task.title,
		folder: task.folder,
		workspaceId: task.workspaceId,
		body: task.notes
	}))}
	workspaceId={controller.selected?.workspaceId}
	onwikilink={controller.handleChatWikiClick}
	onclose={() => (state.assistantOpen = false)}
/>
