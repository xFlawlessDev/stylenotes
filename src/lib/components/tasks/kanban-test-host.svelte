<script lang="ts">
	/**
	 * Test-only wrapper: the app provides `Tooltip.Provider` in `+layout.svelte`,
	 * so smoke tests mount the Kanban window through this host.
	 */
	import Tooltip from '$lib/components/ui/tooltip/tooltip-provider.svelte';
	import KanbanWindow from '$lib/components/tasks/KanbanWindow.svelte';
</script>

<Tooltip>
	<KanbanWindow />
</Tooltip>
