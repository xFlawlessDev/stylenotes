<script lang="ts">
	import { CalendarClock, Link2, Pencil } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import {
		isTaskOverdue,
		priorityMeta,
		taskPriority,
		taskStatus,
		statusMeta,
		formatTaskDate,
		type Task
	} from '$lib/stores/tasks';

	let {
		task,
		selected = false,
		noteTitle = null,
		noteCount = 0,
		dragging = false,
		showStatus = false,
		onselect,
		onedit
	}: {
		task: Task;
		selected?: boolean;
		/** First linked note; extra links are summarised by {@link noteCount}. */
		noteTitle?: string | null;
		noteCount?: number;
		dragging?: boolean;
		showStatus?: boolean;
		onselect: () => void;
		onedit: () => void;
	} = $props();

	const overdue = $derived(isTaskOverdue(task));
	const priority = $derived(priorityMeta[taskPriority(task)]);
	const status = $derived(statusMeta[taskStatus(task)]);
</script>

<div
	class="group relative cursor-grab rounded-2xl p-3 text-left transition-all active:cursor-grabbing {dragging
		? 'opacity-40'
		: ''} {selected
		? 'glass-chip'
		: 'bg-surface-container-lowest/40 hover:bg-surface-container/50'}"
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
	{#if selected}
		<span class="emphasis-primary absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full"></span>
	{/if}

	<div class="mb-1.5 flex items-start justify-between gap-2">
		<h3 class="line-clamp-2 text-body-md font-body font-medium text-on-surface">{task.title}</h3>
		<Button
			bare
			class="shrink-0 rounded-md p-0.5 text-outline opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
			aria-label="Edit task"
			onclick={(event) => {
				event.stopPropagation();
				onedit();
			}}
		>
			<Pencil size={14} />
		</Button>
	</div>

	{#if task.notes}
		<p class="mb-2 line-clamp-2 text-body-sm font-body text-outline">{task.notes}</p>
	{/if}

	<div class="flex flex-wrap items-center gap-1.5">
		{#if showStatus}
			<span class="rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code {status.tone}">
				{status.label}
			</span>
		{/if}
		<span
			class="rounded-md px-1.5 py-px text-code-sm font-code {priority.tone}"
			title="Priority"
		>
			{priority.label}
		</span>
		{#if task.dueAt}
			<span
				class="flex items-center gap-1 rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code {overdue
					? 'text-error'
					: 'text-outline'}"
			>
				<CalendarClock size={11} />
				{formatTaskDate(task.dueAt)}
			</span>
		{/if}
		{#if noteTitle}
			<span
				class="flex max-w-[140px] items-center gap-1 rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code text-tertiary"
			>
				<Link2 size={11} class="shrink-0" />
				<span class="truncate">{noteTitle}</span>
				{#if noteCount > 1}
					<span class="shrink-0 text-outline">+{noteCount - 1}</span>
				{/if}
			</span>
		{/if}
	</div>
</div>
