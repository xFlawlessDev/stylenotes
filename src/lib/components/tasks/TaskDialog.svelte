<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ListTodo } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import {
		fromDateInput,
		taskPriority,
		taskStatus,
		toDateInput,
		type Task,
		type TaskFormData,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import TaskFormFields from '$lib/components/tasks/TaskFormFields.svelte';

	let {
		open = $bindable(false),
		task = null,
		defaultStatus = 'todo',
		defaultFolder,
		compact = false,
		folders,
		notes,
		onsubmit
	}: {
		open?: boolean;
		task?: Task | null;
		defaultStatus?: TaskStatus;
		/** Pre-selected folder for new tasks, e.g. the board's active folder filter. */
		defaultFolder?: string;
		/** Denser layout plus a scrollable max height for dialogs in small windows. */
		compact?: boolean;
		folders: Folder[];
		notes: Note[];
		onsubmit: (data: TaskFormData) => void;
	} = $props();

	let title = $state('');
	let detail = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<TaskPriority>('medium');
	let folder = $state('personal');
	let noteId = $state('');
	let startDate = $state('');
	let dueDate = $state('');

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);

	$effect(() => {
		if (open) {
			title = task?.title ?? '';
			detail = task?.notes ?? '';
			status = task ? taskStatus(task) : defaultStatus;
			priority = task ? taskPriority(task) : 'medium';
			folder = task?.folder ?? defaultFolder ?? folderOptions[0]?.id ?? 'personal';
			noteId = task?.noteId ?? '';
			startDate = toDateInput(task?.startAt ?? null);
			dueDate = toDateInput(task?.dueAt ?? null);
		}
	});

	function submit() {
		if (!title.trim() || dateError) return;
		onsubmit({
			title: title.trim(),
			notes: detail.trim(),
			status,
			priority,
			folder,
			noteId: noteId || null,
			startAt: fromDateInput(startDate),
			dueAt: fromDateInput(dueDate)
		});
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="glass-dialog {compact ? 'max-h-[calc(100vh-1.5rem)] overflow-y-auto p-3' : ''}"
		onkeydown={(event) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
				event.preventDefault();
				submit();
			}
		}}
	>
		<Dialog.Header class={compact ? 'gap-1' : ''}>
			{#if !compact}
				<div
					class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-primary"
				>
					<ListTodo size={18} />
				</div>
			{/if}
			<Dialog.Title
				class={compact
					? 'pr-7 text-headline-sm font-headline text-on-surface'
					: 'text-headline-md font-headline text-on-surface'}
			>
				{task ? 'Edit task' : 'New task'}
			</Dialog.Title>
			{#if !compact}
				<Dialog.Description>
					Give the task a home, a status, and a date range for the calendar view.
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		<form
			class="flex flex-col {compact ? 'gap-3' : 'gap-4'}"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<TaskFormFields
				bind:title
				bind:detail
				bind:status
				bind:priority
				bind:folder
				bind:noteId
				bind:startDate
				bind:dueDate
				{folders}
				{notes}
				{compact}
				idPrefix="task-dialog"
				autofocus
			/>

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button
					type="button"
					variant="outline"
					size={compact ? 'sm' : 'default'}
					onclick={() => (open = false)}>Cancel</Button
				>
				<Button type="submit" size={compact ? 'sm' : 'default'} disabled={!title.trim() || dateError}>
					{task ? 'Save task' : 'Create task'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
