<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import CompactTaskCard from '$lib/components/tasks/CompactTaskCard.svelte';
	import { kanbanDrag } from '$lib/content/kanban-drag';
	import {
		statusMeta,
		tasksByStatus,
		taskStatus,
		TASK_STATUSES,
		type Task,
		type TaskStatus
	} from '$lib/stores/tasks';

	let {
		tasks,
		selectedId = '',
		noteTitles = {},
		onselect,
		onedit,
		onmove,
		onadd
	}: {
		tasks: Task[];
		selectedId?: string;
		noteTitles?: Record<string, string>;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
		onmove: (id: string, status: TaskStatus, beforeId: string | null) => void;
		onadd: (status: TaskStatus) => void;
	} = $props();

	const groups = $derived(tasksByStatus(tasks));

	let draggingId = $state<string | null>(null);
	let overColumn = $state<TaskStatus | null>(null);

	const kanban = (node: HTMLElement) =>
		kanbanDrag(node, {
			onStart: (id) => (draggingId = id),
			onOver: (status) => (overColumn = status),
			onDrop: (id, status, beforeId) => {
				draggingId = null;
				overColumn = null;
				if (!status) return;
				const task = tasks.find((item) => item.id === id);
				if (task && taskStatus(task) === status && (!beforeId || beforeId === id)) return;
				onmove(id, status, beforeId === id ? null : beforeId);
			}
		});
</script>

<section class="@container flex min-h-0 flex-1 flex-col" use:kanban>
	<div
		class="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-1.5 @[360px]:grid-cols-2 @[680px]:grid-cols-4"
	>
		{#each TASK_STATUSES as status (status)}
			{@const column = groups[status]}
			<div
				role="list"
				aria-label={statusMeta[status].label}
				data-task-status={status}
				class="flex min-h-0 min-w-0 flex-col gap-1.5 rounded-xl border p-1.5 transition-colors {overColumn ===
				status
					? 'border-primary/50 bg-primary/5'
					: 'border-hairline/50 bg-surface-container-lowest/45'}"
			>
				<div class="flex items-center justify-between gap-1 px-0.5">
					<span class="flex min-w-0 items-center gap-1.5">
						<span class="size-1.5 shrink-0 rounded-full {statusMeta[status].dot}"></span>
						<span class="truncate text-label-sm font-label font-medium {statusMeta[status].tone}">
							{statusMeta[status].label}
						</span>
					</span>
					<span class="flex shrink-0 items-center gap-0.5">
						<span class="text-code-sm font-code text-outline/80">{column.length}</span>
						<button
							type="button"
							class="flex size-5 items-center justify-center rounded text-outline transition-colors hover:bg-surface-container/70 hover:text-on-surface"
							aria-label="Add task to {statusMeta[status].label}"
							onclick={() => onadd(status)}
						>
							<Plus size={13} />
						</button>
					</span>
				</div>

				<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
					{#each column as task (task.id)}
						<div data-task-id={task.id} data-task-handle role="listitem">
							<CompactTaskCard
								{task}
								selected={selectedId === task.id}
								noteTitle={task.noteId ? (noteTitles[task.noteId] ?? null) : null}
								dragging={draggingId === task.id}
								onselect={() => onselect(task.id)}
								onedit={() => onedit(task)}
							/>
						</div>
					{/each}

					{#if column.length === 0}
						<p class="px-1 py-3 text-center text-code-sm font-code text-outline/50">Drop here</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</section>
