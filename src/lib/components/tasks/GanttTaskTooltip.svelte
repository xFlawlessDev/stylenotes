<script lang="ts">
	import { priorityMeta, statusMeta, taskPriority, taskStatus, type Task } from '$lib/stores/tasks';

	let {
		task,
		overdue = false,
		blockers = []
	}: {
		task: Task;
		overdue?: boolean;
		/** Open blockers that still gate this task, listed by title. */
		blockers?: Task[];
	} = $props();

	const status = $derived(taskStatus(task));
	const priority = $derived(taskPriority(task));
</script>

<div class="flex flex-col gap-0.5">
	<span class="font-medium">{task.title}</span>
	<span class="text-background/70">
		{statusMeta[status].label} · {priorityMeta[priority].label}{overdue ? ' · Overdue' : ''}
	</span>
	{#if blockers.length}
		<span>
			Blocked by {blockers.length}: {blockers.map((item) => item.title).join(', ')}
		</span>
	{/if}
</div>
