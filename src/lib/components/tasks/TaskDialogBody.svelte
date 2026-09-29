<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { CustomFolder, Folder } from '$lib/stores/notes';
	import type { Task, TaskDependency, TaskPriority, TaskStatus } from '$lib/stores/tasks';
	import type { TaskView } from '$lib/stores/settings.svelte';
	import { isTaskBlocked } from '$lib/stores/tasks';
	import { t } from '$lib/i18n/index.svelte';
	import TaskTitleField from '$lib/components/tasks/TaskTitleField.svelte';
	import TaskDetailsEditor from '$lib/components/tasks/TaskDetailsEditor.svelte';
	import TaskMetaFields from '$lib/components/tasks/TaskMetaFields.svelte';
	import DependencyEditor from '$lib/components/tasks/DependencyEditor.svelte';
	import BlockedIndicator from '$lib/components/tasks/BlockedIndicator.svelte';
	import TaskViewSwitcher from '$lib/components/tasks/TaskViewSwitcher.svelte';

	let {
		task,
		view = $bindable('write' as TaskView),
		folders,
		notes,
		customFolders,
		allTasks,
		dependencies = [],
		autofocus = false,
		title = $bindable(''),
		detail = $bindable(''),
		status = $bindable<TaskStatus>('todo'),
		priority = $bindable<TaskPriority>('medium'),
		folder = $bindable('personal'),
		noteIds = $bindable<string[]>([]),
		startDate = $bindable(''),
		dueDate = $bindable(''),
		onadddependency,
		onremovedependency
	}: {
		task: Task | null;
		view?: TaskView;
		folders: Folder[];
		notes: Note[];
		customFolders: CustomFolder[];
		allTasks: Task[];
		dependencies?: TaskDependency[];
		autofocus?: boolean;
		title: string;
		detail: string;
		status: TaskStatus;
		priority: TaskPriority;
		folder: string;
		noteIds: string[];
		startDate: string;
		dueDate: string;
		onadddependency?: (dependsOnTaskId: string) => Promise<string | null> | string | null;
		onremovedependency?: (dependency: TaskDependency) => Promise<string | null> | string | null | void;
	} = $props();

	/** The dialog body mirrors the window: every field column, then the details surface. */
	const stack = $derived(
		view === 'split'
			? 'grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
			: 'flex flex-col gap-4'
	);
	const meta = $derived({ folders, notes, idPrefix: 'task-dialog' });
</script>

<div class="flex min-h-0 flex-1 flex-col">
	{#if view === 'preview'}
		<!-- Preview makes the details the whole surface. -->
		<div class="flex min-h-0 flex-1 flex-col gap-2">
			<TaskTitleField bind:title idPrefix="task-dialog" {autofocus} />
			{@render details()}
			{@render dependencySection()}
		</div>
	{:else}
		<div class={stack}>
			<!-- Column 1: every field except the details body. -->
			<div class="flex min-h-0 flex-col gap-3">
				<TaskTitleField bind:title idPrefix="task-dialog" {autofocus} />
				<TaskMetaFields
					bind:status
					bind:priority
					bind:folder
					bind:startDate
					bind:dueDate
					bind:noteIds
					{...meta}
					layout="stack"
				/>
				{@render dependencySection()}
			</div>
			<!-- Column 2: the details body behaves like a note editor. -->
			{@render details()}
		</div>
	{/if}
</div>

{#snippet details()}
	<div class="flex {view === 'preview' ? 'min-h-0 flex-1' : 'min-h-[280px]'} flex-col gap-1.5">
		<div class="flex shrink-0 items-center justify-between gap-2">
			<span class="text-label-sm font-label tracking-wider text-outline uppercase">{t('tasks.form.details')}</span>
			<TaskViewSwitcher {view} onview={(next) => (view = next)} />
		</div>
		<TaskDetailsEditor
			bind:detail
			{view}
			fill
			{notes}
			tasks={allTasks}
			folders={customFolders}
			{task}
			idPrefix="task-dialog"
		/>
	</div>
{/snippet}

{#snippet dependencySection()}
	{#if onadddependency}
		<section class="shrink-0 rounded-xl bg-surface-container-low/60 p-2.5">
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-label-md font-label font-medium text-on-surface">{t('tasks.dependencies.title')}</h3>
				{#if task}
					<BlockedIndicator blocked={isTaskBlocked(task, allTasks, dependencies)} />
				{/if}
			</div>
			{#if task}
				{@const current = task}
				<DependencyEditor
					task={current}
					tasks={allTasks}
					{dependencies}
					onadd={onadddependency}
					onremove={onremovedependency}
				/>
			{:else}
				<p class="text-label-sm font-label text-outline">
					{t('tasks.dependencies.saveFirst')}
				</p>
			{/if}
		</section>
	{/if}
{/snippet}
