<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import { ListTodo } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import {
		fromDateInput,
		taskNoteIds,
		taskPriority,
		taskStatus,
		toDateInput,
		type Task,
		type TaskDependency,
		type TaskFormData,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import TaskFormFields from '$lib/components/tasks/TaskFormFields.svelte';
	import TaskDialogBody from '$lib/components/tasks/TaskDialogBody.svelte';
	import DependencyEditor from '$lib/components/tasks/DependencyEditor.svelte';

	let {
		open = $bindable(false),
		task = null,
		defaultStatus = 'todo',
		defaultFolder,
		compact = false,
		folders,
		notes,
		tasks = [],
		dependencies = [],
		onsubmit,
		onadddependency,
		onremovedependency
	}: {
		open?: boolean;
		task?: Task | null;
		defaultStatus?: TaskStatus;
		/** Pre-selected folder for new tasks, e.g. the board's active folder filter. */
		defaultFolder?: string;
		/** Denser layout for dialogs in small windows. */
		compact?: boolean;
		folders: Folder[];
		notes: Note[];
		/** Every task in the workspace, for the dependency picker. */
		tasks?: Task[];
		dependencies?: TaskDependency[];
		onsubmit: (data: TaskFormData) => void;
		/** Wires the dependency editor; omit it to hide the section entirely. */
		onadddependency?: (taskId: string, dependsOnTaskId: string) => Promise<string | null> | string | null;
		onremovedependency?: (dependency: TaskDependency) => Promise<string | null> | string | null | void;
	} = $props();

	let title = $state('');
	let detail = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<TaskPriority>('medium');
	let folder = $state('personal');
	let noteIds = $state<string[]>([]);
	let startDate = $state('');
	let dueDate = $state('');

	const folderOptions = $derived(folders.filter((item) => item.id !== 'all'));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);
	/** Compact dialogs (small kanban windows) stay in one narrow column. */
	const sideBySide = $derived(!compact);

	$effect(() => {
		if (open) {
			title = task?.title ?? '';
			detail = task?.notes ?? '';
			status = task ? taskStatus(task) : defaultStatus;
			priority = task ? taskPriority(task) : 'medium';
			folder = task?.folder ?? defaultFolder ?? folderOptions[0]?.id ?? 'personal';
			noteIds = task ? taskNoteIds(task) : [];
			startDate = toDateInput(task?.startAt ?? null);
			dueDate = toDateInput(task?.dueAt ?? null);
		}
	});

	function addDependencyFor(dependsOnTaskId: string) {
		const current = task;
		if (!current || !onadddependency) return null;
		return onadddependency(current.id, dependsOnTaskId);
	}

	function submit() {
		if (!title.trim() || dateError) return;
		onsubmit({
			title: title.trim(),
			notes: detail.trim(),
			status,
			priority,
			folder,
			noteIds: [...noteIds],
			startAt: fromDateInput(startDate),
			dueAt: fromDateInput(dueDate)
		});
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<!-- Header and footer stay pinned; the body scrolls so a long dependency list never hides the actions. -->
	<Dialog.Content
		class="glass-dialog flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden {compact
			? 'gap-3 p-3'
			: ''}"
		onkeydown={(event) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
				event.preventDefault();
				submit();
			}
		}}
	>
		<Dialog.Header class="shrink-0 {compact ? 'gap-1' : ''}">
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
				{task ? t('tasks.dialog.editTitle') : t('tasks.dialog.newTitle')}
			</Dialog.Title>
			{#if !compact}
				<Dialog.Description>
					{t('tasks.dialog.description')}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		<form
			class="flex min-h-0 flex-1 flex-col {compact ? 'gap-3' : 'gap-4'}"
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<div
				class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain {compact
					? 'gap-3'
					: 'gap-4'}"
			>
				{#if sideBySide}
					<TaskDialogBody
						task={task}
						{folders}
						{notes}
						customFolders={[]}
						allTasks={tasks}
						{dependencies}
						bind:title
						bind:detail
						bind:status
						bind:priority
						bind:folder
						bind:noteIds
						bind:startDate
						bind:dueDate
						onadddependency={onadddependency ? addDependencyFor : undefined}
						onremovedependency={onremovedependency}
					/>
				{:else}
					<TaskFormFields
						bind:title
						bind:detail
						bind:status
						bind:priority
						bind:folder
						bind:noteIds
						bind:startDate
						bind:dueDate
						{folders}
						{notes}
						{compact}
						idPrefix="task-dialog"
						autofocus
					/>

					{#if onadddependency}
						{@render dependencySection()}
					{/if}
				{/if}
			</div>

			<Dialog.Footer
				class="mx-0 mb-0 shrink-0 flex-col-reverse gap-2 border-t-0 bg-transparent p-0 sm:flex-row sm:justify-end"
			>
				<Button
					variant="outline"
					size={compact ? 'sm' : 'md'}
					onclick={() => (open = false)}>{t('common.cancel')}</Button
				>
				<Button
					variant="primary"
					type="submit"
					size={compact ? 'sm' : 'md'}
					disabled={!title.trim() || dateError}
				>
					{task ? t('tasks.dialog.save') : t('tasks.dialog.create')}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

{#snippet dependencySection()}
	{#if task}
		{@const current = task}
		<DependencyEditor
			task={current}
			tasks={tasks}
			{dependencies}
			onadd={addDependencyFor}
			onremove={onremovedependency}
		/>
	{:else}
		<p class="text-label-sm font-label text-outline">
			{t('tasks.dependencies.saveFirst')}
		</p>
	{/if}
{/snippet}
