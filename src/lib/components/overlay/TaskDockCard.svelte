<script lang="ts">
	import { CalendarDays, Check, Play, RotateCcw, SquarePen, X } from '@lucide/svelte';
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

	const statusDot: Record<TaskStatus, string> = {
		todo: 'bg-outline',
		doing: 'bg-secondary',
		review: 'bg-tertiary',
		done: 'bg-primary'
	};
</script>

<div
	class="glass-solid flex w-full flex-col gap-2 rounded-xl p-3 shadow-2xl ring-1 ring-hairline"
	role="tooltip"
	onmouseleave={onclose}
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-full {statusDot[status]}"></span>
			<span
				class="text-label-sm font-label font-semibold tracking-wider uppercase {statusMeta[status].tone}"
			>
				{statusMeta[status].label}
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
			{priority.label}
		</span>
		<span
			class="rounded-md bg-surface-container-highest px-1.5 py-px text-code-sm font-code text-on-surface"
		>
			{task.folder}
		</span>
	</div>

	<div class="flex items-center justify-end gap-0.5">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-7 items-center justify-center rounded-lg transition-all {doing
							? 'text-secondary'
							: 'text-on-surface-variant hover:text-secondary'}"
						aria-label={doing ? 'Move back to To do' : 'Move to In progress'}
						onclick={() => onprogress(task)}
					>
						<Play size={15} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{doing ? 'Move back to To do' : 'Move to In progress'}</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:text-primary"
						aria-label={done ? 'Reopen task' : 'Complete task'}
						onclick={() => oncomplete(task)}
					>
						{#if done}
							<RotateCcw size={15} />
						{:else}
							<Check size={15} />
						{/if}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{done ? 'Reopen task' : 'Complete task'}</Tooltip.Content>
		</Tooltip.Root>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-7 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-error-container/40 hover:text-error"
						aria-label="Remove from dock"
						onclick={() => onremove(task)}
					>
						<X size={15} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Remove from dock</Tooltip.Content>
		</Tooltip.Root>
	</div>

	<button
		class="emphasis-container flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-headline-sm font-headline text-on-primary-container ring-1 ring-inset ring-emphasis-container-ring transition-all active:scale-[0.99]"
		onclick={onopen}
	>
		<span class="relative">Edit task</span>
		<SquarePen size={14} />
	</button>
</div>
