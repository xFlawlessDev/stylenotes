<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import DockRail from '$lib/components/overlay/DockRail.svelte';
	import KanbanWindow from '$lib/components/tasks/KanbanWindow.svelte';
	import NoteWindow from '$lib/components/note/NoteWindow.svelte';
	import TaskWindow from '$lib/components/tasks/TaskWindow.svelte';
	import McpHostWatch from '$lib/components/workspace/McpHostWatch.svelte';
	import { refreshSettings, settings } from '$lib/stores/settings.svelte';
	import { restoreKanbanLock } from '$lib/stores/kanban.svelte';
	import { currentWindowRole, isTauri, revealCurrentWindow, type WindowRole } from '$lib/windows';

	/** Resolved before the first render so no window ever paints another role. */
	function detectRole(): WindowRole {
		if (!isTauri) return 'workspace';
		try {
			return currentWindowRole();
		} catch {
			return 'workspace';
		}
	}

	let role = $state<WindowRole>(detectRole());

	onMount(async () => {
		document.documentElement.dataset.window = role;
		await tick();
		if (role === 'kanban') {
			await refreshSettings();
			await restoreKanbanLock();
			// A locked board is a desktop widget: bring it back on launch.
			if (settings.kanbanLocked) requestAnimationFrame(() => revealCurrentWindow());
			return;
		}
		// Note and task windows reveal themselves once their record is loaded.
		if (role === 'note' || role === 'task') return;
		// The dock starts hidden and is shown by the workspace toggle. Revealing
		// it here would show the window before `DockRail` has sized it and set
		// its click-through state, leaving it interactive-less until the user
		// hides and re-shows it by hand.
		if (role === 'overlay') return;
		requestAnimationFrame(() => revealCurrentWindow());
	});
</script>

{#if role === 'overlay'}
	<div class="h-screen w-screen bg-transparent">
		<DockRail />
	</div>
{:else if role === 'kanban'}
	<KanbanWindow />
{:else if role === 'note'}
	<NoteWindow />
{:else if role === 'task'}
	<TaskWindow />
{:else}
	<McpHostWatch />
	<Workspace />
{/if}