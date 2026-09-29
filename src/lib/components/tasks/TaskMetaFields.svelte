<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import {
		TASK_PRIORITIES,
		TASK_STATUSES,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { Field, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import TaskNoteLinks from '$lib/components/tasks/TaskNoteLinks.svelte';
	import TaskScheduleFields from '$lib/components/tasks/TaskScheduleFields.svelte';

	let {
		status = $bindable<TaskStatus>('todo'),
		priority = $bindable<TaskPriority>('medium'),
		folder = $bindable('personal'),
		startDate = $bindable(''),
		dueDate = $bindable(''),
		noteIds = $bindable<string[]>([]),
		folders,
		notes,
		compact = false,
		/** `stack` fills the height for a side column; `inline` flows in a dialog. */
		layout = 'inline',
		idPrefix = 'task',
		class: className = ''
	}: {
		status?: TaskStatus;
		priority?: TaskPriority;
		folder?: string;
		startDate?: string;
		dueDate?: string;
		noteIds?: string[];
		folders: Folder[];
		notes: Note[];
		compact?: boolean;
		layout?: 'inline' | 'stack';
		idPrefix?: string;
		class?: string;
	} = $props();

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));
	const stack = $derived(layout === 'stack');

	// Compact mode is for dialogs inside small windows (e.g. the Kanban board).
	const group = $derived(compact ? 'gap-1' : '');
	const labelClass = $derived(compact ? 'text-label-sm' : '');
	const inputSize = $derived(compact ? 'md' : 'lg');
	const selectSize = $derived(compact ? 'md' : 'lg');
	const selectClass = $derived(compact ? 'px-2 font-code text-code-sm' : '');
	const grid = $derived(compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3');
</script>

<div class="flex {stack ? 'min-h-0 flex-col gap-4' : 'flex-col gap-3.5'} {className}">
	<div class={grid}>
		<Field label={t('tasks.status')} class={group} {labelClass}>
			<Select
				label={t('tasks.status')}
				size={selectSize}
				class={selectClass}
				options={TASK_STATUSES.map((value) => ({ value, label: t('tasks.statusLabel.' + value) }))}
				bind:value={status}
			/>
		</Field>

		<Field label={t('tasks.priority')} class={group} {labelClass}>
			<Select
				label={t('tasks.priority')}
				size={selectSize}
				class={selectClass}
				options={TASK_PRIORITIES.map((value) => ({ value, label: t('tasks.priorityLabel.' + value) }))}
				bind:value={priority}
			/>
		</Field>
	</div>

	<TaskScheduleFields bind:startDate bind:dueDate {compact} {inputSize} {group} {labelClass} {idPrefix} />

	<div class={grid}>
		<Field label={t('common.folder')} class={group} {labelClass}>
			<Select
				label={t('common.folder')}
				size={selectSize}
				class={selectClass}
				options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
				bind:value={folder}
			/>
		</Field>
	</div>

	<TaskNoteLinks bind:noteIds {notes} {compact} class={group} {labelClass} />
</div>
