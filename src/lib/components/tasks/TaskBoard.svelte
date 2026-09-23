<script lang="ts">
	import { onMount } from 'svelte';
	import { listen } from '@tauri-apps/api/event';
	import { LayoutList, Kanban, GanttChart, SlidersHorizontal, Trash2, PictureInPicture2 } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Folder } from '$lib/stores/notes';
	import {
		applyTaskPatch,
		createTask,
		filterTasks,
		moveTaskInList,
		nextPosition,
		statusMeta,
		taskStatus,
		TASK_STATUSES,
		type Task,
		type TaskDueFilter,
		type TaskFormData,
		type TaskPriorityFilter,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, removeTask, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { isTauri, openKanban } from '$lib/windows';
	import { Button, Select } from '$lib/components/base';
	import TaskRail from '$lib/components/tasks/TaskRail.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TaskKanban from '$lib/components/tasks/TaskKanban.svelte';
	import TaskGantt from '$lib/components/tasks/TaskGantt.svelte';
	import TaskFilters from '$lib/components/tasks/TaskFilters.svelte';
	import BlockedIndicator from '$lib/components/tasks/BlockedIndicator.svelte';
	import { dependencyStore } from '$lib/stores/dependencies.svelte';
	import { isTaskBlocked } from '$lib/stores/tasks';
	import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	export type TaskView = 'list' | 'kanban' | 'gantt';

	let {
		tasks = $bindable(),
		selectedId = $bindable(''),
		view = $bindable<TaskView>('kanban'),
		focusToken = 0,
		workspaceId,
		folders,
		notes,
		onnotify
	}: {
		tasks: Task[];
		selectedId?: string;
		view?: TaskView;
		focusToken?: number;
		workspaceId: string;
		folders: Folder[];
		notes: Note[];
		onnotify: (message: string) => void;
	} = $props();
	let activeFolder = $state('all');
	let activeStatus = $state<TaskStatus | 'all'>('all');
	let priority = $state<TaskPriorityFilter>('all');
	let due = $state<TaskDueFilter>('any');
	let query = $state('');
	let dialogOpen = $state(false);
	let editing = $state<Task | null>(null);
	let defaultStatus = $state<TaskStatus>('todo');
	let railOpen = $state(false);

	// Everything except the folder/status filters: the rail counts facets from
	// this so selecting a folder or status never zeroes out the other options.
	const countBase = $derived(filterTasks(tasks, { query, priority, due }));

	const filtered = $derived(
		filterTasks(
			activeStatus === 'all'
				? tasks
				: tasks.filter((task) => task.status === activeStatus),
			{ folder: activeFolder, query, priority, due }
		)
	);

	const filtersDirty = $derived(
		activeFolder !== 'all' || activeStatus !== 'all' || priority !== 'all' || due !== 'any' || !!query
	);

	function resetFilters() {
		activeFolder = 'all';
		activeStatus = 'all';
		priority = 'all';
		due = 'any';
		query = '';
	}

	$effect(() => {
		void focusToken;
		resetFilters();
	});

	const noteTitles = $derived.by(() =>
		Object.fromEntries(notes.map((note) => [note.id, note.title || 'Untitled note']))
	);

	const selectedTask = $derived(tasks.find((task) => task.id === selectedId) ?? null);

	const statusOptions = TASK_STATUSES.map((status) => ({
		value: status,
		label: statusMeta[status].label
	}));

	const folderLabels = $derived(
		Object.fromEntries(folders.map((folder) => [folder.id, folder.label]))
	);

	const views: { id: TaskView; label: string; icon: typeof LayoutList }[] = [
		{ id: 'list', label: 'List', icon: LayoutList },
		{ id: 'kanban', label: 'Kanban', icon: Kanban },
		{ id: 'gantt', label: 'Calendar', icon: GanttChart }
	];

	function openCreate(status: TaskStatus = 'todo') {
		editing = null;
		defaultStatus = status;
		dialogOpen = true;
	}

	function openEdit(task: Task) {
		editing = task;
		dialogOpen = true;
	}

	async function persistOrToast(task: Task) {
		const ok = await persistTask(task);
		if (!ok) onnotify('Could not save task — changes may be lost');
	}

	function commitForm(data: TaskFormData) {
		if (editing) {
			const current = editing;
			const next = applyTaskPatch(current, data);
			tasks = tasks.map((task) => (task.id === current.id ? next : task));
			void persistOrToast(next);
			onnotify('Task updated');
		} else {
			const task = createTask({ ...data, workspaceId, position: nextPosition(tasks, data.status) });
			tasks = [task, ...tasks];
			selectedId = task.id;
			void persistOrToast(task);
			onnotify('Task created');
		}
	}

	function changeStatus(id: string, status: TaskStatus) {
		let updated: Task | undefined;
		tasks = tasks.map((task) => {
			if (task.id !== id) return task;
			updated = applyTaskPatch(task, { status, position: nextPosition(tasks, status) });
			return updated;
		});
		if (updated) void persistOrToast(updated);
	}

	function moveTask(id: string, status: TaskStatus, beforeId: string | null) {
		const next = moveTaskInList(tasks, id, status, beforeId);
		tasks = next;
		const moved = next.find((item) => item.id === id);
		if (moved) void persistOrToast(moved);
	}

	function remove(id: string) {
		const task = tasks.find((item) => item.id === id);
		tasks = tasks.filter((item) => item.id !== id);
		if (selectedId === id) selectedId = tasks[0]?.id ?? '';
		void removeTask(id).then((ok) => {
			if (!ok) onnotify('Could not delete task');
		});
		if (task) onnotify('Task deleted');
	}

	function toggleOverlay(task: Task) {
		const next = applyTaskPatch(task, { overlay: !task.overlay });
		tasks = tasks.map((item) => (item.id === task.id ? next : item));
		void persistOrToast(next);
		onnotify(next.overlay ? 'Added to dock' : 'Removed from dock');
	}

	function syncTasks() {
		void refreshTasks().then((next) => (tasks = next));
	}

	onMount(() => {
		syncTasks();
		let disposed = false;
		let unlisten: (() => void) | undefined;
		if (isTauri) {
			void listen(TASKS_CHANGED, syncTasks).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			});
		}
		return () => {
			disposed = true;
			unlisten?.();
		};
	});

	$effect(() => {
		if (selectedId && !tasks.some((task) => task.id === selectedId)) {
			selectedId = tasks[0]?.id ?? '';
		}
	});
</script>

<div class="flex min-h-0 flex-1 gap-2.5">
	{#if railOpen}
		<button
			class="fixed inset-0 z-30 cursor-default bg-scrim/40 lg:hidden"
			aria-label="Close task filters"
			onclick={() => (railOpen = false)}
		></button>
	{/if}
	<TaskRail
		{folders}
		tasks={filtered}
		{countBase}
		{activeFolder}
		{activeStatus}
		{query}
		open={railOpen}
		onclose={() => (railOpen = false)}
		oncreate={() => openCreate()}
		onselectfolder={(id) => (activeFolder = id)}
		onselectstatus={(status) => (activeStatus = status)}
		onquery={(value) => (query = value)}
	/>

	<section class="glass-panel flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden rounded-2xl p-2.5">
		<div class="flex flex-col gap-2">
			<div class="flex items-center gap-2">
				<Button
					variant="secondary"
					size="icon"
					class="shrink-0 text-on-surface-variant lg:hidden"
					aria-label="Open task filters"
					onclick={() => (railOpen = true)}
				>
					<SlidersHorizontal size={16} />
				</Button>

				<div class="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl p-0.5 lg:flex-none lg:bg-transparent">
					{#each views as item (item.id)}
						{@const Icon = item.icon}
						<Button
							variant={view === item.id ? 'secondary' : 'ghost'}
							size="sm"
							class="shrink-0 gap-1.5 text-label-md {view === item.id
								? 'font-medium'
								: 'text-outline'}"
							aria-pressed={view === item.id}
							onclick={() => (view = item.id)}
						>
							<Icon size={14} /> <span class="hidden sm:inline">{item.label}</span>
						</Button>
					{/each}
				</div>

				<div class="ml-auto flex shrink-0 items-center gap-2">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="secondary"
									size="icon-sm"
									shape="pill"
									class="text-outline"
									aria-label="Open Kanban window"
									onclick={() => void openKanban()}
								>
									<PictureInPicture2 size={14} />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Open Kanban window</Tooltip.Content>
					</Tooltip.Root>

					<span class="hidden text-label-sm font-label text-outline sm:inline">
						{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
					</span>
					{#if selectedTask}
						<span
							class="hidden max-w-[160px] truncate text-label-sm font-label text-outline lg:inline"
							title="Selected task: {selectedTask.title}"
						>
							{selectedTask.title}
						</span>
						<BlockedIndicator
							blocked={isTaskBlocked(selectedTask, tasks, dependencyStore.items)}
						/>
						<Select
							size="sm"
							label="Status of {selectedTask.title}"
							class="w-[130px] px-2 font-code text-code-sm"
							options={statusOptions}
							value={taskStatus(selectedTask)}
							onchange={(next) => changeStatus(selectedTask.id, next as TaskStatus)}
						/>
						<Button
							variant="secondary"
							size="icon-sm"
							shape="pill"
							class="text-outline hover:text-error"
							aria-label="Delete {selectedTask.title}"
							title="Delete {selectedTask.title}"
							onclick={() => remove(selectedTask.id)}
						>
							<Trash2 size={14} />
						</Button>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-2">
				<div class="glass-divider hidden h-px flex-1 sm:block"></div>
				<TaskFilters
					{priority}
					{due}
					dirty={filtersDirty}
					onchangepriority={(value) => (priority = value)}
					onchangedue={(value) => (due = value)}
					onreset={resetFilters}
				/>
			</div>
		</div>

		{#if view === 'list'}
			<TaskList
				tasks={filtered}
				{selectedId}
				{noteTitles}
				{folderLabels}
				onselect={(id) => (selectedId = id)}
				onedit={openEdit}
				onstatus={changeStatus}
				ontoggleoverlay={toggleOverlay}
			/>
		{:else if view === 'kanban'}
			<TaskKanban
				tasks={filtered}
				{selectedId}
				{noteTitles}
				onselect={(id) => (selectedId = id)}
				onedit={openEdit}
				onmove={moveTask}
				onadd={openCreate}
			/>
		{:else}
			<TaskGantt
				tasks={filtered}
				{selectedId}
				onselect={(id) => (selectedId = id)}
				onedit={openEdit}
			/>
		{/if}
	</section>
</div>

<TaskDialog bind:open={dialogOpen} task={editing} {defaultStatus} {folders} {notes} onsubmit={commitForm} />
