<script lang="ts">
	import DependencyList from '$lib/components/tasks/DependencyList.svelte';
	import DependencyPicker from '$lib/components/tasks/DependencyPicker.svelte';
	import type { Task, TaskDependency } from '$lib/stores/tasks';

	let {
		task,
		tasks = [],
		dependencies = [],
		onadd,
		onremove
	}: {
		task: Task;
		tasks?: Task[];
		dependencies?: TaskDependency[];
		/** Returns an error message when the dependency cannot be saved. */
		onadd: (dependsOnTaskId: string) => Promise<string | null> | string | null;
		onremove?: (dependency: TaskDependency) => Promise<string | null> | string | null | void;
	} = $props();

	let error = $state('');

	async function handleAdd(dependsOnTaskId: string) {
		error = (await onadd(dependsOnTaskId)) ?? '';
	}

	async function handleRemove(dependency: TaskDependency) {
		error = (await onremove?.(dependency)) ?? '';
	}
</script>

<DependencyPicker taskId={task.id} {tasks} {dependencies} onadd={handleAdd} />
<DependencyList {task} {tasks} {dependencies} onremove={handleRemove} />
{#if error}<p class="text-label-sm font-label text-error">{error}</p>{/if}
