<script lang="ts">
	/**
	 * Test-only wrapper: the app provides `Tooltip.Provider` in `+layout.svelte`,
	 * so smoke tests mount the Gantt through this host.
	 */
	import Tooltip from '$lib/components/ui/tooltip/tooltip-provider.svelte';
	import TaskGantt from '$lib/components/tasks/TaskGantt.svelte';
	import type { Task, TaskDependency } from '$lib/stores/tasks';

	let {
		tasks,
		allTasks,
		dependencies,
		selectedId = '',
		onselect,
		onedit
	}: {
		tasks: Task[];
		allTasks?: Task[];
		dependencies?: TaskDependency[];
		selectedId?: string;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
	} = $props();
</script>

<Tooltip>
	<TaskGantt {tasks} {allTasks} {dependencies} {selectedId} {onselect} {onedit} />
</Tooltip>
