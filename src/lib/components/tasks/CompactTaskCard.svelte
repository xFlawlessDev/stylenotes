<script lang="ts">
	import { CalendarClock, Link2, Pencil } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import {
		formatTaskDate,
		isTaskOverdue,
		priorityMeta,
		taskPriority,
		type Task
	} from '$lib/stores/tasks';

	let {
		task,
		selected = false,
		noteTitle = null,
		noteCount = 0,
		dragging = false,
		onselect,
		onedit
	}: {
		task: Task;
		selected?: boolean;
		/** First linked note; extra links are summarised by {@link noteCount}. */
		noteTitle?: string | null;
		noteCount?: number;
		dragging?: boolean;
		onselect: () => void;
		onedit: () => void;
	} = $props();

	const overdue = $derived(isTaskOverdue(task));
	const priority = $derived(priorityMeta[taskPriority(task)]);
</script>

<div
	class="group relative cursor-grab rounded-lg px-2 py-1.5 text-left transition-colors active:cursor-grabbing {dragging
		? 'opacity-40'
		: ''} {selected
		? 'glass-chip'
		: 'bg-surface-container/40 hover:bg-surface-container/70'}"
	role="button"
	tabindex="0"
	aria-label="Select task: {task.title}"
	onclick={onselect}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect();
		}
	}}
>
	<div class="flex items-start gap-1.5">
		<span
			class="mt-[5px] size-1.5 shrink-0 rounded-full {priority.dot}"
			title="Priority: {priority.label}"
		></span>
		<h3 class="line-clamp-2 min-w-0 flex-1 text-body-sm font-body leading-snug text-on-surface">
			{task.title}
		</h3>
		<Button
			bare
			class="shrink-0 rounded p-0.5 text-outline opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
			aria-label="Edit task"
			onclick={(event) => {
				event.stopPropagation();
				onedit();
			}}
		>
			<Pencil size={12} />
		</Button>
	</div>

	{#if task.notes}
		<p class="mt-0.5 line-clamp-1 pl-3 text-code-sm font-code text-outline">{task.notes}</p>
	{/if}

	{#if task.dueAt || noteTitle}
		<div class="mt-1 flex items-center gap-2 pl-3 text-code-sm font-code">
			{#if task.dueAt}
				<span class="flex shrink-0 items-center gap-1 {overdue ? 'text-error' : 'text-outline'}">
					<CalendarClock size={10} />
					{formatTaskDate(task.dueAt)}
				</span>
			{/if}
			{#if noteTitle}
				<span class="flex min-w-0 items-center gap-1 text-tertiary">
					<Link2 size={10} class="shrink-0" />
					<span class="truncate">{noteTitle}</span>
					{#if noteCount > 1}
						<span class="shrink-0 text-outline">+{noteCount - 1}</span>
					{/if}
				</span>
			{/if}
		</div>
	{/if}
</div>
