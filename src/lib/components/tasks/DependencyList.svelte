<script lang="ts">
	import { ArrowDown, ArrowUp, Link2Off } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { Task, TaskDependency } from '$lib/stores/tasks';

	let { task, tasks, dependencies, onremove }: {
		task: Task;
		tasks: Task[];
		dependencies: TaskDependency[];
		onremove?: (dependency: TaskDependency) => void;
	} = $props();
	const blockedBy = $derived(dependencies.filter((item) => item.taskId === task.id));
	const blocking = $derived(dependencies.filter((item) => item.dependsOnTaskId === task.id));
	const title = (id: string) => tasks.find((item) => item.id === id)?.title ?? t('tasks.dependencies.deletedTask');
</script>

{#if blockedBy.length || blocking.length}
	<div class="flex flex-col gap-2">
		{#if blockedBy.length}
			<div class="flex items-center gap-1.5 text-label-sm font-label text-outline"><ArrowDown size={13} /> {t('tasks.dependencies.blockedBy')}</div>
			{#each blockedBy as dependency (dependency.dependsOnTaskId)}
				<div class="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-body-sm">
					<span class="min-w-0 truncate {tasks.find((item) => item.id === dependency.dependsOnTaskId)?.completed ? 'text-outline line-through' : 'text-on-surface'}">{title(dependency.dependsOnTaskId)}</span>
					<Button bare size="icon-xs" aria-label={t('tasks.dependencies.remove')} onclick={() => onremove?.(dependency)}><Link2Off size={13} /></Button>
				</div>
			{/each}
		{/if}
		{#if blocking.length}
			<div class="flex items-center gap-1.5 text-label-sm font-label text-outline"><ArrowUp size={13} /> {t('tasks.dependencies.blocking')}</div>
			{#each blocking as dependency (dependency.taskId)}
				<div class="rounded-lg bg-surface-container-low px-2 py-1.5 text-body-sm text-on-surface">{title(dependency.taskId)}</div>
			{/each}
		{/if}
	</div>
{/if}
