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
	import { acceptedSuggestions as loadAcceptedSuggestions, acceptSuggestion, buildClusters, memoryReady, memoryStore, refreshThemes, rejectSuggestion, semanticSearch } from '$lib/stores/memory.svelte';
	import type { GraphSuggestion } from '$lib/content/workspace-graph';

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

	const ws = $derived(controller.state);

	/** Accepted suggestions feed the real graph; pending ones show as cards. */
	let acceptedSuggestions = $state<GraphSuggestion[]>([]);
	const pendingSuggestionList = $derived(memoryStore.suggestions);

	async function reloadSuggestions() {
		acceptedSuggestions = await loadAcceptedSuggestions();
		await refreshThemes();
	}

	async function buildThemes() {
		await buildClusters();
	}

	// Reload whenever the graph is shown, so a decision or a fresh index shows up.
	$effect(() => {
		if (ws.section === 'graph') void reloadSuggestions();
	});

	async function decideSuggestion(id: string, accept: boolean) {
		const ok = accept ? await acceptSuggestion(id) : await rejectSuggestion(id);
		if (ok) await reloadSuggestions();
	}
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
	onsettings={() => controller.openSettings()}
	{mode}
	section={ws.section}
	showpanelbuttons={!ws.fullPreview}
	onsection={(next: WorkspaceSection) => {
		ws.section = next;
		ws.fullPreview = false;
	}}
	onopenfolders={() => {
		ws.railOpen = true;
		ws.feedOpen = false;
	}}
	onopennotes={() => {
		ws.feedOpen = true;
		ws.railOpen = false;
	}}
	ontogglemode={toggleMode}
	ontoggledock={toggleOverlay}
	onassistant={() => (ws.assistantOpen = !ws.assistantOpen)}
	{notifications}
/>

{#if ws.section === 'graph'}
	<div class="ws-grid relative flex min-h-0 flex-1">
		<GraphPage
			notes={ws.items}
			tasks={ws.tasks}
			folders={ws.customFolders}
			{dependencies}
			suggestions={[...acceptedSuggestions, ...pendingSuggestionList]}
			pendingSuggestions={pendingSuggestionList}
			onopen={controller.openGraphNode}
			themes={memoryStore.themes}
			onbuildthemes={() => void buildThemes()}
			onsemantic={(query) => semanticSearch(query, { limit: 30 })}
			semanticReady={memoryReady()}
			onacceptsuggestion={(id) => void decideSuggestion(id, true)}
			onrejectsuggestion={(id) => void decideSuggestion(id, false)}
		/>
	</div>
{:else if ws.section === 'tasks'}
	<div class="ws-grid relative flex min-h-0 flex-1">
		<TaskBoard
			bind:tasks={ws.tasks}
			bind:selectedId={ws.selectedTaskId}
			bind:view={ws.taskView}
			focusToken={ws.taskFocusToken}
			workspaceId={workspaceStore.activeId}
			folders={controller.folders}
			notes={ws.items}
			onnotify={controller.showToast}
		/>
	</div>
{:else}
	<NotesWorkspace
		items={ws.items}
		visible={controller.visible}
		folders={controller.folders}
		customFolders={ws.customFolders}
		folderLabelMap={controller.folderLabelMap}
		tags={controller.tags}
		selected={controller.selected}
		bind:selectedId={ws.selectedId}
		activeFolder={ws.activeFolder}
		activeTag={ws.activeTag}
		tasks={ws.tasks}
		fullPreview={ws.fullPreview}
		newNoteToken={ws.newNoteToken}
		journal={controller.journal}
		journalNavigation={controller.journalNavigation}
		onwikilink={controller.handleWikiClick}
		bind:railOpen={ws.railOpen}
		bind:feedOpen={ws.feedOpen}
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
				ws.selectedId = id;
			},
			pin: (id: string) =>
				controller.updateNote(id, {
					pinned: !ws.items.find((n) => n.id === id)?.pinned,
				}),
			openwindow: controller.openNoteInWindow,
			toggledock: (id: string) =>
				controller.updateNote(id, {
					overlay: !ws.items.find((n) => n.id === id)?.overlay,
				}),
			togglearchive: controller.toggleArchive,
			printnote: (note) => void controller.noteActions.print(note),
			exportnote: (note) => void controller.noteActions.export(note),
			copynote: (note) => void controller.noteActions.copy(note),
			deletenote: controller.deleteNote,
			updatenote: controller.updateNote,
			togglefullpreview: () => (ws.fullPreview = !ws.fullPreview),
		}}
	/>
{/if}

<!-- Hosted at the shell so the assistant overlays notes, tasks and the graph
     alike; `onclose` only closes it, wikilinks route through the controller. -->
<AiChatPanel
	open={ws.assistantOpen}
	notes={ws.items}
	tasks={ws.tasks.map((task) => ({
		id: task.id,
		title: task.title,
		folder: task.folder,
		workspaceId: task.workspaceId,
		body: task.notes
	}))}
	workspaceId={controller.selected?.workspaceId}
	onwikilink={controller.handleChatWikiClick}
	onnotify={controller.addNotification}
	onopensettings={controller.openSettings}
	onclose={() => (ws.assistantOpen = false)}
/>