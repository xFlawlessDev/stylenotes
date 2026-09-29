<script lang="ts">
	/**
	 * Test-only wrapper: the app provides `Tooltip.Provider` in `+layout.svelte`,
	 * so smoke tests mount the task dialog through this host.
	 */
	import * as Tooltip from '$lib/components/ui/tooltip';
	import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import type { Task, TaskDependency, TaskFormData, TaskStatus } from '$lib/stores/tasks';

	let {
		open = false,
		task = null,
		defaultStatus = 'todo',
		defaultFolder,
		compact = false,
		folders,
		notes,
		tasks = [],
		dependencies = [],
		onsubmit,
		onadddependency,
		onremovedependency
	}: {
		open?: boolean;
		task?: Task | null;
		defaultStatus?: TaskStatus;
		defaultFolder?: string;
		compact?: boolean;
		folders: Folder[];
		notes: Note[];
		tasks?: Task[];
		dependencies?: TaskDependency[];
		onsubmit: (data: TaskFormData) => void;
		onadddependency?: (taskId: string, dependsOnTaskId: string) => Promise<string | null> | string | null;
		onremovedependency?: (dependency: TaskDependency) => Promise<string | null> | string | null | void;
	} = $props();
</script>

<Tooltip.Provider>
	<TaskDialog
		bind:open
		{task}
		{defaultStatus}
		{defaultFolder}
		{compact}
		{folders}
		{notes}
		{tasks}
		{dependencies}
		{onsubmit}
		{onadddependency}
		{onremovedependency}
	/>
</Tooltip.Provider>
