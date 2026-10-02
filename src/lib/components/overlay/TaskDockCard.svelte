<script lang="ts">
	import { CalendarDays, Check, Play, RotateCcw, SquarePen, X } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import {
		formatTaskDate,
		isTaskOverdue,
		priorityMeta,
		statusMeta,
		taskPriority,
		taskStatus,
		type Task,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { workspaceLookup } from '$lib/workspace-sync.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		task,
		onopen,
		onprogress,
		oncomplete,
		onremove,
		onclose
	}: {
		task: Task;
		onopen: () => void;
		onprogress: (task: Task) => void;
		oncomplete: (task: Task) => void;
		onremove: (task: Task) => void;
		onclose: () => void;
	} = $props();

	const status = $derived(taskStatus(task));
	const priority = $derived(priorityMeta[taskPriority(task)]);
	const done = $derived(status === 'done');
	const doing = $derived(status === 'doing');
	const overdue = $derived(isTaskOverdue(task));
	const workspace = $derived(workspaceLookup()(task.workspaceId));

	const statusDot: Record<TaskStatus, string> = {
		backlog: 'bg-outline/50',
		todo: 'bg-outline',
		doing: 'bg-secondary',
		review: 'bg-tertiary',
		done: 'bg-primary'
	};
</script>

<div
	class="glass-solid flex w-full flex-col gap-2 rounded-xl p-3 ring-1 ring-hairline"
	role="tooltip"
	onmouseleave={onclose}
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-full {statusDot[status]}"></span>
			<span
				class="text-label-sm font-label font-semibold tracking-wider uppercase {statusMeta[status].tone}"
			>
				{t('tasks.statusLabel.' + status)}
			</span>
		</div>
		<span
			class="flex items-center gap-1 text-code-sm font-code {overdue
				? 'text-error'
				: 'text-on-surface-variant'}"
		>
			<CalendarDays size={12} />
			{formatTaskDate(task.dueAt)}
		</span>
	</div>

	<div class="flex flex-col gap-1">
		<h2
			class="text-headline-sm font-headline leading-tight {done
				? 'text-on-surface-variant line-through'
				: 'text-on-surface'}"
		>
			{task.title}
		</h2>
		{#if task.notes}
			<p class="line-clamp-2 text-body-sm font-body leading-relaxed text-on-surface-variant">
				{task.notes}
			</p>
		{/if}
	</div>

	<div class="flex items-center gap-1.5">
		<span class="rounded-md px-1.5 py-px text-code-sm font-code {priority.tone}">
			{t('tasks.priorityLabel.' + taskPriority(task))}
		</span>
		<span
			class="rounded-md bg-surface-container-highest px-1.5 py-px text-code-sm font-code text-on-surface"
		>
			{task.folder}
		</span>
		<WorkspaceBadge name={workspace.name} color={workspace.color} />
	</div>

	<div class="flex items-center justify-end gap-0.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-sm"
						class={doing ? 'text-secondary' : 'text-on-surface-variant hover:text-secondary'}
						aria-label={doing ? t('over.taskCard.moveToTodo') : t('over.taskCard.moveToProgress')}
						onclick={() => onprogress(task)}
					>
						<Play size={15} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{doing ? t('over.taskCard.moveToTodo') : t('over.taskCard.moveToProgress')}</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-sm"
						class="text-on-surface-variant hover:text-primary"
						aria-label={done ? t('over.taskCard.reopen') : t('over.taskCard.complete')}
						onclick={() => oncomplete(task)}
					>
						{#if done}
							<RotateCcw size={15} />
						{:else}
							<Check size={15} />
						{/if}
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{done ? t('over.taskCard.reopen') : t('over.taskCard.complete')}</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-sm"
						class="text-on-surface-variant hover:bg-error-container/40 hover:text-error"
						aria-label={t('over.taskCard.removeFromDock')}
						onclick={() => onremove(task)}
					>
						<X size={15} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{t('over.taskCard.removeFromDock')}</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<Button
		variant="tonal"
		size="md"
		shape="tile"
		block
		class="gap-1.5 px-3 py-1.5 font-headline text-headline-sm active:scale-[0.99]"
		onclick={onopen}
	>
		<span class="relative">{t('over.taskCard.edit')}</span>
		<SquarePen size={14} />
	</Button>
</div>
