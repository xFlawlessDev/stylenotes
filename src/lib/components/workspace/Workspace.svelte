<script lang="ts">
	import { createWorkspaceController } from '$lib/stores/workspace-controller.svelte';
	import WorkspaceScope from '$lib/components/workspace/WorkspaceScope.svelte';
	import WorkspaceShell from '$lib/components/workspace/WorkspaceShell.svelte';
	import WorkspaceOverlays from '$lib/components/workspace/WorkspaceOverlays.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
	import NotificationPanel from '$lib/components/workspace/NotificationPanel.svelte';
	import { settings, toggleMode } from '$lib/stores/settings.svelte';
	import { dependencyStore } from '$lib/stores/dependencies.svelte';
	import { workspaceInsights } from '$lib/stores/workspace-insights';
	import { primeAttachments } from '$lib/stores/attachments.svelte';
	import type { InsightTarget } from '$lib/content/notification-insights';

	const controller = createWorkspaceController();
	const { state } = controller;

	// The attachment catalog is primed lazily, so the "unused attachments"
	// insight has nothing to count until something asks for it. Opening the
	// panel is that ask; `primeAttachments` runs once per session, so this does
	// not rescan on every open.
	$effect(() => {
		if (state.notificationsOpen) void primeAttachments();
	});

	/**
	 * Routes a live insight row to where it can be acted on, closing the panel
	 * first so the destination is not hidden behind it.
	 */
	function handleInsight(target: InsightTarget) {
		state.notificationsOpen = false;
		if (target.kind === 'settings') controller.openSettings(target.section);
		else if (target.kind === 'journal') void controller.openTodayJournal();
		else state.section = target.section;
	}
</script>

<svelte:window onkeydown={controller.onGlobalKeydown} />

{#snippet notificationsSlot()}
	<NotificationPanel
		open={state.notificationsOpen}
		notifications={state.notifications}
		insights={workspaceInsights(state.tasks, dependencyStore.items, state.items)}
		ontoggle={() => {
			const next = !state.notificationsOpen;
			controller.closePanels();
			state.notificationsOpen = next;
		}}
		onread={controller.markRead}
		onreadall={controller.markAllRead}
		onclear={controller.clearNotifications}
		onopenupdate={() => controller.openSettings('about')}
		oninsight={handleInsight}
		onclose={() => (state.notificationsOpen = false)}
	/>
{/snippet}

<WorkspaceScope>
	<div class="relative flex h-screen w-screen flex-col overflow-hidden bg-surface">
		<WorkspaceShell
			{controller}
			mode={settings.mode}
			dependencies={dependencyStore.items}
			notifications={notificationsSlot}
		/>

		<WorkspaceOverlays
			toast={state.toast}
			bind:createOpen={state.createOpen}
			bind:folderOpen={state.folderOpen}
			bind:deleteOpen={state.deleteOpen}
			bind:folderDeleteOpen={state.folderDeleteOpen}
			bind:resetOpen={state.resetOpen}
			paletteOpen={state.paletteOpen}
			onpaletteclose={() => (state.paletteOpen = false)}
			items={state.items}
			folders={controller.folders}
			tasks={state.tasks}
			onselectnote={(id) => {
				state.selectedId = id;
				state.section = 'notes';
			}}
			onselecttask={controller.selectTask}
			onselectfolder={controller.selectFolder}
			settingsOpen={state.settingsOpen}
			settingsSection={state.settingsSection}
			onsettingsclose={() => (state.settingsOpen = false)}
			onexport={() => controller.noteActions.exportAll(state.items, controller.folders)}
			onresetdata={() => (state.resetOpen = true)}
			notecount={state.items.length}
			existingTitles={new Set(state.items.map((note) => note.title.toLowerCase()))}
			onimportnotes={controller.importNotes}
			onnewnote={controller.createNote}
			onnewfolder={controller.openAddFolder}
			ontogglemode={toggleMode}
			onopensettings={() => controller.openSettings()}
			onopentasks={() => (state.section = 'tasks')}
			onopengraph={() => (state.section = 'graph')}
			oncreatenote={controller.commitNewNote}
			folderLabels={controller.folders.map((folder) => folder.label)}
			oncreatefolder={controller.commitNewFolder}
			pendingDelete={state.pendingDelete}
			onconfirmdelete={() => {
				if (state.pendingDelete) controller.performDelete(state.pendingDelete.id);
				state.pendingDelete = null;
			}}
			oncanceldelete={() => (state.pendingDelete = null)}
			pendingFolder={state.pendingFolder}
			onconfirmfolderdelete={() => {
				if (state.pendingFolder) controller.performDeleteFolder(state.pendingFolder.id);
				state.pendingFolder = null;
			}}
			oncancelfolderdelete={() => (state.pendingFolder = null)}
			onreset={controller.resetData}
		/>
		<AmbiguousWikiDialog
			bind:open={state.ambiguousOpen}
			entities={state.ambiguousEntities}
			heading={state.ambiguousHeading}
			onselect={(entity, heading) => void controller.selectWikiTarget(entity, heading)}
		/>
	</div>
</WorkspaceScope>
