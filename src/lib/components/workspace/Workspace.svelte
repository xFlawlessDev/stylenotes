<script lang="ts">
	import { createWorkspaceController } from '$lib/stores/workspace-controller.svelte';
	import WorkspaceScope from '$lib/components/workspace/WorkspaceScope.svelte';
	import WorkspaceShell from '$lib/components/workspace/WorkspaceShell.svelte';
	import WorkspaceOverlays from '$lib/components/workspace/WorkspaceOverlays.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
	import NotificationPanel from '$lib/components/workspace/NotificationPanel.svelte';
	import { settings, toggleMode } from '$lib/stores/settings.svelte';
	import { dependencyStore } from '$lib/stores/dependencies.svelte';

	const controller = createWorkspaceController();
	const { state } = controller;
</script>

<svelte:window onkeydown={controller.onGlobalKeydown} />

{#snippet notificationsSlot()}
	<NotificationPanel
		open={state.notificationsOpen}
		notifications={state.notifications}
		ontoggle={() => {
			const next = !state.notificationsOpen;
			controller.closePanels();
			state.notificationsOpen = next;
		}}
		onread={controller.markRead}
		onreadall={controller.markAllRead}
		onclear={controller.clearNotifications}
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
