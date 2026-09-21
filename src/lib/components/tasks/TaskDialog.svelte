<script lang="ts">
	import { tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import SelectField from '$lib/components/fields/SelectField.svelte';
	import { ListTodo } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import {
		TASK_STATUSES,
		TASK_PRIORITIES,
		statusMeta,
		priorityMeta,
		taskStatus,
		taskPriority,
		toDateInput,
		fromDateInput,
		type Task,
		type TaskStatus,
		type TaskPriority
	} from '$lib/stores/tasks';

	export type TaskFormData = {
		title: string;
		notes: string;
		status: TaskStatus;
		priority: TaskPriority;
		folder: string;
		noteId: string | null;
		startAt: string | null;
		dueAt: string | null;
	};

	let {
		open = $bindable(false),
		task = null,
		defaultStatus = 'todo',
		folders,
		notes,
		onsubmit
	}: {
		open?: boolean;
		task?: Task | null;
		defaultStatus?: TaskStatus;
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
	let titleEl = $state<HTMLInputElement | null>(null);

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);

	$effect(() => {
		if (open) {
			title = task?.title ?? '';
			detail = task?.notes ?? '';
			status = task ? taskStatus(task) : defaultStatus;
			priority = task ? taskPriority(task) : 'medium';
			folder = task?.folder ?? folderOptions[0]?.id ?? 'personal';
			noteId = task?.noteId ?? '';
			startDate = toDateInput(task?.startAt ?? null);
			dueDate = toDateInput(task?.dueAt ?? null);
			void tick().then(() => titleEl?.focus());
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
		class="glass-dialog"
		onkeydown={(event) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
				event.preventDefault();
				submit();
			}
		}}
	>
		<Dialog.Header>
			<div
				class="mb-1 flex size-10 items-center justify-center rounded-xl bg-surface-container text-primary"
			>
				<ListTodo size={18} />
			</div>
			<Dialog.Title class="text-headline-md font-headline text-on-surface">
				{task ? 'Edit task' : 'New task'}
			</Dialog.Title>
			<Dialog.Description>
				Give the task a home, a status, and a date range for the calendar view.
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="flex flex-col gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div class="flex flex-col gap-2">
				<Label for="task-title" class="text-label-md font-label text-on-surface-variant">Title</Label>
				<Input
					id="task-title"
					bind:ref={titleEl}
					bind:value={title}
					placeholder="What needs doing?"
					class="glass-well h-9 border-0 text-body-md font-body text-on-surface placeholder:text-outline focus-visible:ring-1 focus-visible:ring-primary/50"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="task-notes" class="text-label-md font-label text-on-surface-variant"
					>Details <span class="text-outline">(optional)</span></Label
				>
				<textarea
					id="task-notes"
					bind:value={detail}
					rows="2"
					placeholder="Context, links, next steps."
					class="glass-well w-full resize-none rounded-lg px-3 py-2 text-body-sm font-body text-on-surface placeholder:text-outline focus:border-primary/50 focus:outline-none"
				></textarea>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label class="text-label-md font-label text-on-surface-variant">Status</Label>
					<SelectField
						label="Status"
						options={TASK_STATUSES.map((value) => ({ value, label: statusMeta[value].label }))}
						bind:value={status}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label class="text-label-md font-label text-on-surface-variant"
						>Priority</Label
					>
					<SelectField
						label="Priority"
						options={TASK_PRIORITIES.map((value) => ({ value, label: priorityMeta[value].label }))}
						bind:value={priority}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="task-start" class="text-label-md font-label text-on-surface-variant">Start</Label>
					<Input
						id="task-start"
						type="date"
						bind:value={startDate}
						class="glass-well h-9 border-0 text-body-md font-body text-on-surface focus-visible:ring-1 focus-visible:ring-primary/50"
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="task-due" class="text-label-md font-label text-on-surface-variant">Due</Label>
					<Input
						id="task-due"
						type="date"
						bind:value={dueDate}
						class="glass-well h-9 border-0 text-body-md font-body text-on-surface focus-visible:ring-1 focus-visible:ring-primary/50"
					/>
				</div>
			</div>

			{#if dateError}
				<p class="text-label-sm font-label text-error">The due date cannot precede the start date.</p>
			{/if}

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label class="text-label-md font-label text-on-surface-variant">Folder</Label>
					<SelectField
						label="Folder"
						options={folderOptions.map((option) => ({ value: option.id, label: option.label }))}
						bind:value={folder}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label class="text-label-md font-label text-on-surface-variant"
						>Linked note <span class="text-outline">(optional)</span></Label
					>
					<SelectField
						label="Linked note"
						placeholder="None"
						options={[
							{ value: '', label: 'None' },
							...notes.map((note) => ({ value: note.id, label: note.title || 'Untitled note' }))
						]}
						bind:value={noteId}
					/>
				</div>
			</div>

			<Dialog.Footer
				class="mx-0 mb-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={!title.trim() || dateError}>
					{task ? 'Save task' : 'Create task'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>