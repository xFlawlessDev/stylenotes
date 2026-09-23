<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import { ListTodo, NotebookPen } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { foldersFor, listNotes, loadFolders, type CustomFolder } from '$lib/stores/notes';
	import { createSaveQueue } from '$lib/stores/save-queue.svelte';
	import {
		applySettingsSnapshot,
		hydrateSettings,
		settings,
		SETTINGS_CHANGED,
		updateSettings,
		type Settings
	} from '$lib/stores/settings.svelte';
	import {
		applyTaskPatch,
		fromDateInput,
		taskPriority,
		taskStatus,
		isTaskBlocked,
		toDateInput,
		type Task,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { addDependency, dependencyStore, refreshDependencies, removeDependency } from '$lib/stores/dependencies.svelte';
	import {
		currentTaskId,
		isTauri,
		openNoteWindow,
		revealAndFocusCurrentWindow
	} from '$lib/windows';
	import { activeWorkspace, hydrateWorkspaces } from '$lib/stores/workspaces.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import TaskFormFields from '$lib/components/tasks/TaskFormFields.svelte';
	import DependencyPicker from '$lib/components/tasks/DependencyPicker.svelte';
	import DependencyList from '$lib/components/tasks/DependencyList.svelte';
	import BlockedIndicator from '$lib/components/tasks/BlockedIndicator.svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';

	const taskId = currentTaskId();

	let task = $state<Task | null>(null);
	let notes = $state<Note[]>([]);
	let customFolders = $state<CustomFolder[]>([]);
	let loaded = $state(false);

	let title = $state('');
	let detail = $state('');
	let status = $state<TaskStatus>('todo');
	let priority = $state<TaskPriority>('medium');
	let folder = $state('personal');
	let noteId = $state('');
	let startDate = $state('');
	let dueDate = $state('');
	let revealed = $state(false);
	let closing = false;
	let dependencyError = $state('');
	let allTasks = $state<Task[]>([]);

	const folders = $derived(foldersFor(notes, customFolders));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);
	const queue = createSaveQueue<Task>(persistTask);

	/** Mirrors the loaded task into the form fields. */
	$effect(() => {
		const current = task;
		if (!current) return;
		title = current.title;
		detail = current.notes;
		status = taskStatus(current);
		priority = taskPriority(current);
		folder = current.folder;
		noteId = current.noteId ?? '';
		startDate = toDateInput(current.startAt);
		dueDate = toDateInput(current.dueAt);
		loaded = true;
	});

	/** Persists form edits, debounced through the save queue. */
	$effect(() => {
		if (!loaded) return;
		const patch = formPatch();
		untrack(() => {
			const current = task;
			if (!current || dateError) return;
			const next = applyTaskPatch(current, patch);
			if (sameTask(current, next)) return;
			queue.enqueue(next);
		});
	});

	/** The current form values as a task patch. */
	function formPatch() {
		return {
			title: title.trim() || 'Untitled task',
			notes: detail,
			status,
			priority,
			folder,
			noteId: noteId || null,
			startAt: fromDateInput(startDate),
			dueAt: fromDateInput(dueDate)
		};
	}

	/** Field-level comparison so the initial form sync does not trigger a write. */
	function sameTask(a: Task, b: Task): boolean {
		return (
			a.title === b.title &&
			a.notes === b.notes &&
			a.status === b.status &&
			a.priority === b.priority &&
			a.folder === b.folder &&
			a.noteId === b.noteId &&
			a.startAt === b.startAt &&
			a.dueAt === b.dueAt
		);
	}

	async function load() {
		const [tasks, storedNotes, storedFolders] = await Promise.all([
			refreshTasks(),
			listNotes(),
			loadFolders(),
			refreshDependencies()
		]);
		notes = storedNotes;
		customFolders = storedFolders;
		allTasks = tasks;
		task = tasks.find((item) => item.id === taskId) ?? null;
	}

	async function addTaskDependency(dependsOnTaskId: string) {
		if (!task) return;
		dependencyError = (await addDependency(task.id, dependsOnTaskId, (await refreshTasks())))
			? ''
			: 'Dependency is invalid or would create a cycle.';
	}

	function toggleDock() {
		const current = task;
		if (!current) return;
		const next = applyTaskPatch(current, { ...formPatch(), overlay: !current.overlay });
		task = next;
		queue.enqueue(next);
	}

	function toggleAlwaysOnTop() {
		updateSettings({ detailAlwaysOnTop: !settings.detailAlwaysOnTop });
	}

	async function applyAlwaysOnTop(value: boolean) {
		if (!isTauri) return;
		try {
			await getCurrentWindow().setAlwaysOnTop(value);
		} catch {
			/* the platform may refuse; the setting stays authoritative */
		}
	}

	async function minimize() {
		if (!isTauri) return;
		try {
			await getCurrentWindow().minimize();
		} catch {
			/* already minimized */
		}
	}

	async function closeWindow() {
		if (closing) return;
		closing = true;
		await queue.flush();
		if (!isTauri) return;
		try {
			await getCurrentWindow().destroy();
		} catch {
			/* already closed */
		}
	}

	onMount(() => {
		const unlisteners: (() => void)[] = [];
		let disposed = false;

		void (async () => {
			await hydrateWorkspaces();
			await hydrateSettings();
			await load();
			await applyAlwaysOnTop(settings.detailAlwaysOnTop);
			if (disposed) return;
			requestAnimationFrame(() => {
				void (async () => {
					await revealAndFocusCurrentWindow();
					if (!disposed) revealed = true;
				})();
			});
		})();

		if (!isTauri) return;

		void listen(TASKS_CHANGED, () => {
			if (!queue.state.dirty) void load();
		}).then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		void listen<Settings>(SETTINGS_CHANGED, (event) => {
			applySettingsSnapshot(event.payload);
			void applyAlwaysOnTop(settings.detailAlwaysOnTop);
		}).then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		void getCurrentWindow()
			.onCloseRequested((event) => {
				if (closing) return;
				event.preventDefault();
				void closeWindow();
			})
			.then((fn) => (disposed ? fn() : unlisteners.push(fn)));

		return () => {
			disposed = true;
			for (const off of unlisteners) off();
		};
	});
</script>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-surface">
	<DetailWindowHeader
		{title}
		fallbackTitle="Untitled task"
		icon={ListTodo}
		saving={queue.state.saving}
		saveFailed={queue.state.failed}
		docked={task?.overlay ?? false}
		alwaysOnTop={settings.detailAlwaysOnTop}
		ontoggledock={toggleDock}
		ontoggletop={toggleAlwaysOnTop}
		onminimize={minimize}
		onclose={closeWindow}
	>
		{#snippet actions()}
			{#if task?.noteId}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								bare
								class="size-6 rounded-md text-on-surface-variant"
								aria-label="Open linked note"
								onclick={() => task?.noteId && void openNoteWindow(task.noteId)}
							>
								<NotebookPen size={13} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Open linked note</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		{/snippet}
	</DetailWindowHeader>

	{#if task}
		<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3">
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
				idPrefix="task-window"
				autofocus={revealed}
			/>
			<section class="flex flex-col gap-2 rounded-xl bg-surface-container-low/60 p-2.5">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-label-md font-label font-medium text-on-surface">Task dependencies</h2>
					<WorkspaceBadge name={activeWorkspace().name} color={activeWorkspace().color} />
					<BlockedIndicator
						blocked={isTaskBlocked(task, allTasks, dependencyStore.items)}
					/>
				</div>
				<DependencyPicker
					taskId={task.id}
					tasks={allTasks}
					dependencies={dependencyStore.items}
					onadd={addTaskDependency}
				/>
				<DependencyList task={task} tasks={allTasks} dependencies={dependencyStore.items} onremove={(item) => void removeDependency(item)} />
				{#if dependencyError}<p class="text-label-sm text-error">{dependencyError}</p>{/if}
			</section>
		</div>
	{:else}
		<EmptyState
			size="md"
			icon={ListTodo}
			heading="Task unavailable"
			title="This task was deleted or could not be loaded."
			class="gap-3"
		>
			<Button
				variant="secondary"
				size="md"
				class="px-3 text-label-md text-on-surface-variant hover:text-on-surface"
				onclick={closeWindow}
			>
				Close window
			</Button>
		</EmptyState>
	{/if}
</div>
