<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { CustomFolder, Folder } from '$lib/stores/notes';
	import type { Task, TaskDependency, TaskPriority, TaskStatus } from '$lib/stores/tasks';
	import type { TaskView } from '$lib/stores/settings.svelte';
	import type { WikiClick } from '$lib/content/wiki-links';
	import { isTaskBlocked } from '$lib/stores/tasks';
	import { dependencyStore } from '$lib/stores/dependencies.svelte';
	import TaskTitleField from '$lib/components/tasks/TaskTitleField.svelte';
	import TaskDetailsEditor from '$lib/components/tasks/TaskDetailsEditor.svelte';
	import TaskMetaFields from '$lib/components/tasks/TaskMetaFields.svelte';
	import DependencyEditor from '$lib/components/tasks/DependencyEditor.svelte';
	import BlockedIndicator from '$lib/components/tasks/BlockedIndicator.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';

	let {
		task,
		view,
		folders,
		notes,
		customFolders,
		allTasks,
		workspaceName,
		workspaceColor,
		foreignWorkspace,
		autofocus = false,
		title = $bindable(''),
		detail = $bindable(''),
		status = $bindable<TaskStatus>('todo'),
		priority = $bindable<TaskPriority>('medium'),
		folder = $bindable('personal'),
		noteIds = $bindable<string[]>([]),
		startDate = $bindable(''),
		dueDate = $bindable(''),
		onwikilink,
		onadddependency,
		onremovedependency
	}: {
		task: Task;
		view: TaskView;
		folders: Folder[];
		notes: Note[];
		customFolders: CustomFolder[];
		allTasks: Task[];
		workspaceName: string;
		workspaceColor: string;
		foreignWorkspace: boolean;
		autofocus?: boolean;
		title: string;
		detail: string;
		status: TaskStatus;
		priority: TaskPriority;
		folder: string;
		noteIds: string[];
		startDate: string;
		dueDate: string;
		onwikilink?: (click: WikiClick) => void;
		onadddependency: (dependsOnTaskId: string) => Promise<string | null> | string | null;
		onremovedependency?: (dependency: TaskDependency) => Promise<string | null> | string | null | void;
	} = $props();

	/** Column 1 rests on the window's own scroll; column 2 is the details surface. */
	const stack = $derived(view === 'split' ? 'grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : 'flex flex-col gap-4');
	const meta = $derived({ folders, notes, idPrefix: 'task-window' });
</script>

<div class="flex min-h-0 flex-1 flex-col p-2.5 pt-2">
	{#if view === 'preview'}
		<!-- The focus mode on preview: the details are the whole surface. -->
		<div class="flex min-h-0 flex-1 flex-col gap-2">
			<TaskTitleField bind:title idPrefix="task-window" {autofocus} />
			{@render details()}
			{@render dependencySection()}
		</div>
	{:else}
		<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto">
			<div class={stack}>
				<!-- Column 1: every field except the details body. -->
				<div class="flex min-h-0 flex-col gap-3">
					<TaskTitleField bind:title idPrefix="task-window" {autofocus} />
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
		</div>
	{/if}
</div>

{#snippet details()}
	<div class="flex {view === 'preview' ? 'min-h-0 flex-1' : 'min-h-[280px]'} flex-col gap-1.5">
		<span class="shrink-0 text-label-sm font-label tracking-wider text-outline uppercase">
			Details
		</span>
		<TaskDetailsEditor
			bind:detail
			{view}
			fill
			{notes}
			tasks={allTasks}
			folders={customFolders}
			{task}
			{onwikilink}
			idPrefix="task-window"
		/>
	</div>
{/snippet}

{#snippet dependencySection()}
	<section class="shrink-0 rounded-xl bg-surface-container-low/60 p-2.5">
		<div class="flex items-center gap-2">
			<h2 class="text-label-md font-label font-medium text-on-surface">Task dependencies</h2>
			<WorkspaceBadge name={workspaceName} color={workspaceColor} foreign={foreignWorkspace} />
			<span class="ml-auto flex items-center gap-1.5">
				<BlockedIndicator blocked={isTaskBlocked(task, allTasks, dependencyStore.items)} />
			</span>
		</div>
		<DependencyEditor
			{task}
			tasks={allTasks}
			dependencies={dependencyStore.items}
			onadd={onadddependency}
			onremove={onremovedependency}
		/>
	</section>
{/snippet}
