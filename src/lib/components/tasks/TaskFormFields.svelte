<script lang="ts">
	import type { Note } from '$lib/content/content';
	import { tick } from 'svelte';
	import type { Folder } from '$lib/stores/notes';
	import type { Task, TaskPriority, TaskStatus } from '$lib/stores/tasks';
	import type { WikiClick } from '$lib/content/wiki-links';
	import { Field, Input } from '$lib/components/base';
	import TaskDetailsEditor from '$lib/components/tasks/TaskDetailsEditor.svelte';
	import TaskMetaFields from '$lib/components/tasks/TaskMetaFields.svelte';

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

	// Compact mode is for dialogs inside small windows (e.g. the Kanban board).
	const stack = $derived(compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3.5');
	const group = $derived(compact ? 'gap-1' : '');
	const labelClass = $derived(compact ? 'text-label-sm' : '');
	const inputSize = $derived(compact ? 'md' : 'lg');
	const inputClass = $derived(compact ? 'text-body-sm' : '');

	$effect(() => {
		if (!autofocus || focusedOnce) return;
		focusedOnce = true;
		void tick().then(() => titleEl?.focus());
	});
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

	<TaskMetaFields
		bind:status
		bind:priority
		bind:folder
		bind:startDate
		bind:dueDate
		bind:noteIds
		{folders}
		{notes}
		{compact}
		{idPrefix}
	/>
</div>
