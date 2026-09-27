<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import TaskCard from '$lib/components/tasks/TaskCard.svelte';
	import { kanbanDrag } from '$lib/content/kanban-drag';
	import {
		firstNoteTitle,
		statusMeta,
		taskNoteIds,
		tasksByStatus,
		taskStatus,
		TASK_STATUSES,
		type Task,
		type TaskStatus
	} from '$lib/stores/tasks';

	let {
		tasks,
		selectedId,
		noteTitles = {},
		onselect,
		onedit,
		onmove,
		onadd
	}: {
		tasks: Task[];
		selectedId: string;
		noteTitles?: Record<string, string>;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
		onmove: (id: string, status: TaskStatus, beforeId: string | null) => void;
		onadd: (status: TaskStatus) => void;
	} = $props();

	const groups = $derived(tasksByStatus(tasks));

	let draggingId = $state<string | null>(null);
	let overColumn = $state<TaskStatus | null>(null);

	function endTaskDrag(id: string, status: TaskStatus | null, beforeId: string | null) {
		draggingId = null;
		overColumn = null;
		if (!status) return;
		const task = tasks.find((item) => item.id === id);
		if (task && taskStatus(task) === status && (!beforeId || beforeId === id)) return;
		onmove(id, status, beforeId === id ? null : beforeId);
	}

	const kanban = (node: HTMLElement) =>
		kanbanDrag(node, {
			onStart: (id) => (draggingId = id),
			onOver: (status) => (overColumn = status),
			onDrop: endTaskDrag
		});
</script>

<section class="@container flex min-h-0 flex-1 flex-col pb-1" use:kanban>
	<div
		class="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-3 @[420px]:grid-cols-2 @[820px]:grid-cols-4"
	>
		{#each TASK_STATUSES as status (status)}
			{@const column = groups[status]}
			<div
				role="list"
				aria-label={statusMeta[status].label}
				data-task-status={status}
				class="glass-panel flex min-h-0 min-w-0 flex-col gap-2.5 rounded-2xl p-2.5 transition-all {overColumn ===
				status
					? 'ring-1 ring-inset ring-primary/50'
					: ''}"
			>
				<div class="flex items-center justify-between px-1 pt-0.5">
					<div class="flex items-center gap-2">
						<span class="text-label-md font-label font-semibold {statusMeta[status].tone}">
							{statusMeta[status].label}
						</span>
						<span
							class="rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code text-outline"
						>
							{column.length}
						</span>
					</div>
					<Button
						bare
						class="size-6 rounded-md text-outline hover:bg-surface-container/60 hover:text-on-surface"
						aria-label="Add task to {statusMeta[status].label}"
						onclick={() => onadd(status)}
					>
						<Plus size={15} />
					</Button>
				</div>

				<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
					{#each column as task (task.id)}
						<div
							data-task-id={task.id}
							data-task-handle
							role="listitem"
						>
							<TaskCard
								{task}
								selected={selectedId === task.id}
								noteTitle={firstNoteTitle(task, noteTitles)}
								noteCount={taskNoteIds(task).length}
								dragging={draggingId === task.id}
								onselect={() => onselect(task.id)}
								onedit={() => onedit(task)}
							/>
						</div>
					{/each}

					{#if column.length === 0}
						<p class="px-2 py-6 text-center text-code-sm font-code text-outline/70">
							Drop tasks here
						</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>
