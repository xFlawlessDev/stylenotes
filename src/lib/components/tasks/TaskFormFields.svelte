<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { tick } from 'svelte';
	import type { Folder } from '$lib/stores/notes';
	import {
		TASK_PRIORITIES,
		TASK_STATUSES,
		priorityMeta,
		statusMeta,
		type Task,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import type { WikiClick } from '$lib/content/wiki-links';
	import { Field, Input, Select } from '$lib/components/base';
	import TaskDetailsEditor from '$lib/components/tasks/TaskDetailsEditor.svelte';
	import TaskNoteLinks from '$lib/components/tasks/TaskNoteLinks.svelte';

	let {
		title = $bindable(''),
		detail = $bindable(''),
		status = $bindable<TaskStatus>('todo'),
		priority = $bindable<TaskPriority>('medium'),
		folder = $bindable('personal'),
		noteIds = $bindable<string[]>([]),
		startDate = $bindable(''),
		dueDate = $bindable(''),
		folders,
		notes,
		task = null,
		tasks = [],
		preview = false,
		onwikilink,
		idPrefix = 'task',
		autofocus = false,
		compact = false
	}: {
		title?: string;
		detail?: string;
		status?: TaskStatus;
		priority?: TaskPriority;
		folder?: string;
		/** Notes this task links to; the picker reads and writes the whole list. */
		noteIds?: string[];
		startDate?: string;
		dueDate?: string;
		folders: Folder[];
		notes: Note[];
		/** The record being edited, so details can resolve wiki links. */
		task?: Task | null;
		tasks?: Task[];
		/** Adds a Write/Preview switch to the details field. */
		preview?: boolean;
		onwikilink?: (click: WikiClick) => void;
		idPrefix?: string;
		autofocus?: boolean;
		compact?: boolean;
	} = $props();

	let titleEl = $state<HTMLInputElement | null>(null);
	let focusedOnce = false;

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));

	// Compact mode is for dialogs inside small windows (e.g. the Kanban board).
	const stack = $derived(compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3.5');
	const group = $derived(compact ? 'gap-1' : '');
	const labelClass = $derived(compact ? 'text-label-sm' : '');
	const inputSize = $derived(compact ? 'md' : 'lg');
	const inputClass = $derived(compact ? 'text-body-sm' : '');
	const selectSize = $derived(compact ? 'md' : 'lg');
	const selectClass = $derived(compact ? 'px-2 font-code text-code-sm' : '');
	const grid = $derived(compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3');

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		void tick().then(() => titleEl?.focus());
	});

	function shortDate(value: string): boolean {
		return !!value && value.length === 10;
	}

	const dateError = $derived(shortDate(startDate) && shortDate(dueDate) && dueDate < startDate);
</script>

<div class={stack}>
	<Field label="Title" for="{idPrefix}-title" class={group} {labelClass}>
		<Input
			id="{idPrefix}-title"
			bind:ref={titleEl}
			bind:value={title}
			size={inputSize}
			class={inputClass}
			placeholder="What needs doing?"
		/>
	</Field>

	<Field label="Details" hint="optional" for="{idPrefix}-notes" class={group} {labelClass}>
		<TaskDetailsEditor
			{idPrefix}
			bind:detail
			{task}
			{notes}
			{tasks}
			{folders}
			{preview}
			{compact}
			{onwikilink}
		/>
	</Field>

	<div class={grid}>
		<Field label="Status" class={group} {labelClass}>
			<Select
				label="Status"
				size={selectSize}
				class={selectClass}
				options={TASK_STATUSES.map((value) => ({ value, label: statusMeta[value].label }))}
				bind:value={status}
			/>
		</Field>

		<Field label="Priority" class={group} {labelClass}>
			<Select
				label="Priority"
				size={selectSize}
				class={selectClass}
				options={TASK_PRIORITIES.map((value) => ({ value, label: priorityMeta[value].label }))}
				bind:value={priority}
			/>
		</Field>

		<Field label="Start" for="{idPrefix}-start" class={group} {labelClass}>
			<Input
				id="{idPrefix}-start"
				type="date"
				size={inputSize}
				class={inputClass}
				bind:value={startDate}
			/>
		</Field>

		<Field label="Due" for="{idPrefix}-due" class={group} {labelClass}>
			<Input
				id="{idPrefix}-due"
				type="date"
				size={inputSize}
				class={inputClass}
				bind:value={dueDate}
			/>
		</Field>
	</div>

	{#if dateError}
		<p class="text-label-sm font-label text-error">The due date cannot precede the start date.</p>
	{/if}

	<div class={grid}>
		<Field label="Folder" class={group} {labelClass}>
			<Select
				label="Folder"
				size={selectSize}
				class={selectClass}
				options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
				bind:value={folder}
			/>
		</Field>
	</div>

	<TaskNoteLinks
		bind:noteIds
		{notes}
		{compact}
		class={group}
		{labelClass}
	/>
</div>
