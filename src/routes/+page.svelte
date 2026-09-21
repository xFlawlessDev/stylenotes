<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import DockRail from '$lib/components/overlay/DockRail.svelte';
	import KanbanWindow from '$lib/components/tasks/KanbanWindow.svelte';
	import { refreshSettings, settings } from '$lib/stores/settings.svelte';
	import { registerKanbanShortcut, restoreKanbanLock } from '$lib/stores/kanban.svelte';
	import { currentWindowRole, revealCurrentWindow, type WindowRole } from '$lib/windows';

	let role = $state<WindowRole>('workspace');

	onMount(async () => {
		role = currentWindowRole();
		document.documentElement.dataset.window = role;
		await tick();
		if (role === 'kanban') {
			// The Kanban webview is alive from launch (hidden), so registering the
			// global shortcut here makes it available app-wide.
			void registerKanbanShortcut();
			await refreshSettings();
			await restoreKanbanLock();
			// A locked board is a desktop widget: bring it back on launch.
			if (settings.kanbanLocked) requestAnimationFrame(() => revealCurrentWindow());
			return;
		}
		requestAnimationFrame(() => revealCurrentWindow());
	});
</script>

{#if role === 'overlay'}
	<div class="h-screen w-screen bg-transparent">
		<DockRail />
	</div>
{:else if role === 'kanban'}
	<KanbanWindow />
{:else}
	<Workspace />
{/if}
