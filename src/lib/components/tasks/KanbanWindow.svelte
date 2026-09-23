<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import { Lock, LockOpen, Minus, NotebookPen, X } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { foldersFor, hydrateNotes, loadFolders, type CustomFolder } from '$lib/stores/notes';
	import {
		applyTaskPatch,
		createTask,
		moveTaskInList,
		nextPosition,
		taskStatus,
		type Task,
		type TaskFormData,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import {
		KANBAN_SHORTCUT_LABEL,
		listenKanbanLockChanged,
		toggleKanbanLock
	} from '$lib/stores/kanban.svelte';
	import { isTauri, openTasksInWorkspace } from '$lib/windows';
	import { hydrateWorkspaces, workspaceStore } from '$lib/stores/workspaces.svelte';
	import { refreshDependencies } from '$lib/stores/dependencies.svelte';
	import CompactKanban from '$lib/components/tasks/CompactKanban.svelte';
	import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';
	import { Button, Select } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let tasks = $state<Task[]>([]);
	let notes = $state<Note[]>([]);
	let customFolders = $state<CustomFolder[]>([]);
	let selectedId = $state('');
	let dialogOpen = $state(false);
	let editing = $state<Task | null>(null);
	let defaultStatus = $state<TaskStatus>('todo');
	let folderFilter = $state('all');
	let notice = $state('');

	const folders = $derived(foldersFor(notes, customFolders));
	const folderOptions = $derived([
		{ value: 'all', label: 'All folders' },
		...folders
			.filter((folder) => folder.id !== 'all')
			.map((folder) => ({ value: folder.id, label: folder.label }))
	]);
	const visibleTasks = $derived(
		folderFilter === 'all' ? tasks : tasks.filter((task) => task.folder === folderFilter)
	);
	const noteTitles = $derived(
		Object.fromEntries(notes.map((note) => [note.id, note.title || 'Untitled note']))
	);
	const locked = $derived(settings.kanbanLocked);
	const openCount = $derived(visibleTasks.filter((task) => taskStatus(task) !== 'done').length);

	function notify(message: string) {
		notice = message;
		setTimeout(() => {
			if (notice === message) notice = '';
		}, 2200);
	}

	async function syncTasks() {
		tasks = await refreshTasks();
	}

	function openCreate(status: TaskStatus = 'todo') {
		editing = null;
		defaultStatus = status;
		dialogOpen = true;
	}

	function openEdit(task: Task) {
		editing = task;
		dialogOpen = true;
	}

	async function persistOrNotify(task: Task) {
		if (!(await persistTask(task))) notify('Could not save task — changes may be lost');
	}

	function commitForm(data: TaskFormData) {
		if (editing) {
			const current = editing;
			const next = applyTaskPatch(current, data);
			tasks = tasks.map((task) => (task.id === current.id ? next : task));
			void persistOrNotify(next);
			notify('Task updated');
			return;
		}
		const task = createTask({ ...data, workspaceId: workspaceStore.activeId, position: nextPosition(tasks, data.status) });
		tasks = [task, ...tasks];
		selectedId = task.id;
		void persistOrNotify(task);
		notify('Task created');
	}

	function moveTask(id: string, status: TaskStatus, beforeId: string | null) {
		const next = moveTaskInList(tasks, id, status, beforeId);
		tasks = next;
		const moved = next.find((item) => item.id === id);
		if (moved) void persistOrNotify(moved);
	}

	async function toggleLock() {
		const applied = await toggleKanbanLock();
		notify(
			!applied
				? 'Could not change the lock state'
				: settings.kanbanLocked
					? `Locked to desktop — press ${KANBAN_SHORTCUT_LABEL} to unlock`
					: 'Unlocked — always on top'
		);
	}

	async function hideWindow() {
		if (!isTauri) return;
		try {
			await getCurrentWindow().hide();
		} catch {
			/* the window may already be hidden */
		}
	}

	onMount(() => {
		void (async () => {
			await hydrateWorkspaces();
			await syncTasks();
			await refreshDependencies();
			const [storedNotes, storedFolders] = await Promise.all([hydrateNotes(), loadFolders()]);
			notes = storedNotes;
			customFolders = storedFolders;
		})();

		let unlisten: (() => void) | undefined;
		let unlistenLock: (() => void) | undefined;
		let disposed = false;
		if (isTauri) {
			void listen(TASKS_CHANGED, () => void syncTasks()).then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			});
			void listenKanbanLockChanged().then((fn) => {
				if (disposed) fn();
				else unlistenLock = fn;
			});
		}
		return () => {
			disposed = true;
			unlisten?.();
			unlistenLock?.();
		};
	});
</script>

<div class="@container flex h-screen w-screen flex-col gap-1.5 overflow-hidden bg-surface p-1.5">
	<header
		data-tauri-drag-region
		class="flex h-9 shrink-0 items-center justify-between gap-2 rounded-xl border border-hairline/50 bg-surface-container-lowest/45 px-2.5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<img src="/icon-128.png" alt="StyleNotes" class="size-4 shrink-0 object-cover" />
			<span class="text-label-md font-label font-semibold tracking-tight text-on-surface">Kanban</span>
			<span class="shrink-0 text-code-sm font-code text-outline">
				{openCount} open · {visibleTasks.length} total
			</span>
			<div class="hidden shrink-0 @[560px]:block">
				<Select
					size="sm"
					label="Filter tasks by folder"
					class="w-[124px] px-2 font-code text-code-sm"
					options={folderOptions}
					bind:value={folderFilter}
				/>
			</div>
		</div>

		{#if locked}
			<span
				class="flex shrink-0 items-center gap-1.5 rounded-full bg-emphasis-container px-2 py-0.5 text-code-sm font-code text-on-primary-container"
				title="Desktop underlay — the window does not take input while locked"
			>
				<Lock size={11} />
				Locked · {KANBAN_SHORTCUT_LABEL} to unlock
			</span>
		{:else}
			<div class="flex shrink-0 items-center gap-0.5">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								size="icon-sm"
								aria-label="Lock Kanban window to desktop"
								onclick={toggleLock}
							>
								<Lock size={14} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Lock to desktop ({KANBAN_SHORTCUT_LABEL})</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								size="icon-sm"
								aria-label="Open StyleNotes on the Kanban view"
								onclick={() => void openTasksInWorkspace()}
							>
								<NotebookPen size={14} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Open StyleNotes (Tasks · Kanban)</Tooltip.Content>
				</Tooltip.Root>

				<span class="mx-0.5 h-4 w-px bg-hairline/70"></span>

				<Button
					size="icon-sm"
					aria-label="Minimize"
					onclick={() => isTauri && getCurrentWindow().minimize()}
				>
					<Minus size={14} />
				</Button>
				<Button
					size="icon-sm"
					class="hover:bg-window-close/20"
					aria-label="Hide to tray"
					onclick={hideWindow}
				>
					<X size={14} />
				</Button>
			</div>
		{/if}
	</header>

	<CompactKanban
		tasks={visibleTasks}
		{selectedId}
		{noteTitles}
		onselect={(id) => (selectedId = id)}
		onedit={openEdit}
		onmove={moveTask}
		onadd={openCreate}
	/>

	{#if notice}
		<div
			class="glass-solid pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full px-3 py-1.5 text-code-sm font-code text-on-surface"
		>
			{notice}
		</div>
	{/if}
</div>

<TaskDialog
	bind:open={dialogOpen}
	task={editing}
	{defaultStatus}
	defaultFolder={folderFilter === 'all' ? undefined : folderFilter}
	compact
	{folders}
	{notes}
	onsubmit={commitForm}
/>
