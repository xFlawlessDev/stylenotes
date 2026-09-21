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
		type TaskStatus,
		type TaskDueFilter,
		type TaskPriorityFilter
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, removeTask, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { isTauri, openKanban } from '$lib/windows';
	import SelectField from '$lib/components/fields/SelectField.svelte';
	import TaskRail from '$lib/components/tasks/TaskRail.svelte';
	import TaskList from '$lib/components/tasks/TaskList.svelte';
	import TaskKanban from '$lib/components/tasks/TaskKanban.svelte';
	import TaskGantt from '$lib/components/tasks/TaskGantt.svelte';
	import TaskFilters from '$lib/components/tasks/TaskFilters.svelte';
	import TaskDialog, { type TaskFormData } from '$lib/components/tasks/TaskDialog.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	type TaskView = 'list' | 'kanban' | 'gantt';

	let {
		tasks = $bindable(),
		selectedId = $bindable(''),
		focusToken = 0,
		folders,
		notes,
		onnotify
	}: {
		tasks: Task[];
		selectedId?: string;
		focusToken?: number;
		folders: Folder[];
		notes: Note[];
		onnotify: (message: string) => void;
	} = $props();

	let view = $state<TaskView>('list');
	let activeFolder = $state('all');
	let activeStatus = $state<TaskStatus | 'all'>('all');
	let priority = $state<TaskPriorityFilter>('all');
	let due = $state<TaskDueFilter>('any');
	let query = $state('');
	let dialogOpen = $state(false);
	let editing = $state<Task | null>(null);
	let defaultStatus = $state<TaskStatus>('todo');
	let railOpen = $state(false);

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
			const task = createTask({ ...data, position: nextPosition(tasks, data.status) });
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
				<button
					class="glass-chip flex size-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:text-on-surface lg:hidden"
					aria-label="Open task filters"
					onclick={() => (railOpen = true)}
				>
					<SlidersHorizontal size={16} />
				</button>

				<div class="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl p-0.5 lg:flex-none lg:bg-transparent">
					{#each views as item (item.id)}
						{@const Icon = item.icon}
						<button
							class="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-label-md font-label transition-all sm:px-3 {view ===
							item.id
								? 'glass-chip font-medium text-on-surface'
								: 'text-outline hover:text-on-surface'}"
							onclick={() => (view = item.id)}
						>
							<Icon size={14} /> <span class="hidden sm:inline">{item.label}</span>
						</button>
					{/each}
				</div>

				<div class="ml-auto flex shrink-0 items-center gap-2">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="button"
									class="glass-chip flex size-7 items-center justify-center rounded-full text-outline transition-colors hover:text-on-surface"
									aria-label="Open Kanban window"
									onclick={() => void openKanban()}
								>
									<PictureInPicture2 size={14} />
								</button>
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
						<SelectField
							size="sm"
							label="Status of {selectedTask.title}"
							class="h-7 w-[130px] px-2 text-code-sm font-code"
							options={statusOptions}
							value={taskStatus(selectedTask)}
							onchange={(next) => changeStatus(selectedTask.id, next as TaskStatus)}
						/>
						<button
							type="button"
							class="glass-chip flex size-7 items-center justify-center rounded-full text-outline transition-colors hover:text-error"
							aria-label="Delete {selectedTask.title}"
							title="Delete {selectedTask.title}"
							onclick={() => remove(selectedTask.id)}
						>
							<Trash2 size={14} />
						</button>
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