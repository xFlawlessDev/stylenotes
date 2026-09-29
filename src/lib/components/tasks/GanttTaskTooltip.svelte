<script lang="ts">
	import { taskPriority, taskStatus, type Task } from '$lib/stores/tasks';
	import { t } from '$lib/i18n/index.svelte';

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
		{t('tasks.statusLabel.' + status)} · {t('tasks.priorityLabel.' + priority)}{overdue
			? ' · ' + t('tasks.gantt.overdue')
			: ''}
	</span>
	{#if blockers.length}
		<span>
			{t('tasks.gantt.blockedByList', {
				count: blockers.length,
				names: blockers.map((item) => item.title).join(', ')
			})}
		</span>
	{/if}
</div>
