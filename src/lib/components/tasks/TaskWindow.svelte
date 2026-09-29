<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import { ListTodo, NotebookPen, History } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import { foldersFor, listNotes, loadFolders, type CustomFolder } from '$lib/stores/notes';
	import { createSaveQueue } from '$lib/stores/save-queue.svelte';
	import { registerQuitFlush } from '$lib/stores/quit-flush';
	import { versioning } from '$lib/stores/versioning';
	import { setPendingEdit } from '$lib/stores/mcp-pending-edits';
	import { createWikiController } from '$lib/content/wiki-controller';
	import type { WikiEntity } from '$lib/content/wiki-links';
	import {
		applySettingsSnapshot,
		hydrateSettings,
		settings,
		SETTINGS_CHANGED,
		updateSettings,
		type Settings,
		type TaskView
	} from '$lib/stores/settings.svelte';
	import {
		applyTaskPatch,
		fromDateInput,
		taskPriority,
		taskStatus,
		taskNoteIds,
		toDateInput,
		type Task,
		type TaskDependency,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { detailWorkspaceId, listAllTasks, listWorkspaceTasks } from '$lib/stores/tasks.svelte';
	import {
		addDependency,
		DEPENDENCIES_CHANGED,
		refreshDependencies,
		removeDependency
	} from '$lib/stores/dependencies.svelte';
	import {
		currentTaskId,
		isTauri,
		openNoteWindow,
		revealAndFocusCurrentWindow
	} from '$lib/windows';
	import { hydrateWorkspaces, workspaceStore } from '$lib/stores/workspaces.svelte';
	import { startWorkspaceSync, workspaceLookup } from '$lib/workspace-sync.svelte';
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import TaskWindowBody from '$lib/components/tasks/TaskWindowBody.svelte';
	import TaskViewSwitcher from '$lib/components/tasks/TaskViewSwitcher.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
	import RecordHistoryDialog from '$lib/components/dialogs/RecordHistoryDialog.svelte';
	import type { EntityVersion } from '$lib/content/version-types';
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
	let noteIds = $state<string[]>([]);
	let startDate = $state('');
	let dueDate = $state('');
	let revealed = $state(false);
	let closing = false;
	let historyOpen = $state(false);
	let allTasks = $state<Task[]>([]);
	let candidateEntities = $state<WikiEntity[]>([]);
	let candidatesOpen = $state(false);
	let pendingHeading = $state<string | null>(null);
	/** The window honors the setting on load, then owns the choice locally. */
	let view = $state<TaskView>('write');
	/** Workspace of the shown task; the window may follow a different one. */
	let recordWorkspaceId = $state('workspace-default');

	const folders = $derived(foldersFor(notes, customFolders));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);
	const linkedNotes = $derived(
		taskNoteIds({ noteId: task?.noteId ?? null, noteIds })
			.map((id) => notes.find((note) => note.id === id))
			.filter((note): note is Note => !!note)
	);
	const queue = createSaveQueue<Task>(persistTask);
	/** The window is universal: the badge names the task's own workspace. */
	const taskWorkspace = $derived(workspaceLookup()(task?.workspaceId));
	const foreignWorkspace = $derived(
		!!task && (task.workspaceId ?? 'workspace-default') !== workspaceStore.activeId
	);

	const wiki = createWikiController({
		flush: () => queue.flush(),
		source: () => task,
		notes: () => notes,
		tasks: () => allTasks,
		folders: () => customFolders,
		onnotes: (next) => (notes = next)
	});

	/** Mirrors the loaded task into the form fields. */
	$effect(() => {
		const current = task;
		if (!current) return;
		title = current.title;
		detail = current.notes;
		status = taskStatus(current);
		priority = taskPriority(current);
		folder = current.folder;
		noteIds = taskNoteIds(current);
		startDate = toDateInput(current.startAt);
		dueDate = toDateInput(current.dueAt);
		loaded = true;
	});

	// Publish the unsaved-edit state so the MCP host refuses to overwrite it (#D4).
	$effect(() => {
		if (!taskId) return;
		setPendingEdit('task', taskId, queue.state.dirty);
		return () => setPendingEdit('task', taskId, false);
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
			// History is best-effort; the pre-image is `current`.
			if (settings.versioningEnabled) void versioning.captureTask(current);
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
			noteIds: [...noteIds],
			startAt: fromDateInput(startDate),
			dueAt: fromDateInput(dueDate)
		};
	}

	/** Field-level comparison so the initial form sync does not trigger a write. */
	function sameTask(a: Task, b: Task): boolean {
		const aLinks = taskNoteIds(a);
		const bLinks = taskNoteIds(b);
		return (
			a.title === b.title &&
			a.notes === b.notes &&
			a.status === b.status &&
			a.priority === b.priority &&
			a.folder === b.folder &&
			aLinks.length === bLinks.length &&
			aLinks.every((id, index) => id === bLinks[index]) &&
			a.startAt === b.startAt &&
			a.dueAt === b.dueAt
		);
	}

	async function load() {
		// The window is universal: resolve the task across every workspace, then
		// load the folders, notes and dependencies of that same workspace.
		const all = await listAllTasks();
		recordWorkspaceId = detailWorkspaceId(all, taskId);
		const [allTasksInWorkspace, storedNotes, storedFolders] = await Promise.all([
			listWorkspaceTasks(recordWorkspaceId),
			listNotes(recordWorkspaceId),
			loadFolders(recordWorkspaceId)
		]);
		notes = storedNotes;
		customFolders = storedFolders;
		allTasks = allTasksInWorkspace;
		task = allTasksInWorkspace.find((item) => item.id === taskId) ?? null;
		await refreshDependencies(recordWorkspaceId);
	}

	/** Applies a saved version to the form; the save effect persists the result. */
	function restoreVersion(version: EntityVersion) {
		const payload = version.payload as Partial<Task>;
		if (payload.title !== undefined) title = payload.title;
		if (payload.notes !== undefined) detail = payload.notes;
		if (payload.status) status = payload.status;
		if (payload.priority) priority = payload.priority;
		if (payload.folder !== undefined) folder = payload.folder;
		if (payload.noteIds) noteIds = [...payload.noteIds];
		if (payload.startAt !== undefined) startDate = toDateInput(payload.startAt);
		if (payload.dueAt !== undefined) dueDate = toDateInput(payload.dueAt);
	}

	/** Re-reads the dependency rows this window shows (its task's workspace). */
	function reloadDependencies() {
		void refreshDependencies(recordWorkspaceId);
	}

	async function addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<string | null> {
		return (await addDependency(taskId, dependsOnTaskId, allTasks))
			? null
			: 'Dependency is invalid or would create a cycle.';
	}

	async function removeTaskDependency(dependency: TaskDependency): Promise<string | null> {
		return (await removeDependency(dependency)) ? null : 'Could not remove dependency.';
	}

	function handleWikiClick(click: Parameters<typeof wiki.resolve>[0]) {
		const result = wiki.resolve(click);
		if (result.status === 'choose') {
			candidateEntities = result.entities;
			pendingHeading = result.heading;
			candidatesOpen = result.entities.length > 0;
		}
	}

	function changeView(next: TaskView) {
		view = next;
		updateSettings({ taskView: next });
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
			await startWorkspaceSync();
			await hydrateSettings();
			view = settings.taskView;
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

		void listen(DEPENDENCIES_CHANGED, () => void reloadDependencies()).then((fn) =>
			disposed ? fn() : unlisteners.push(fn)
		);

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

		// Flush before the tray's Quit exits, so the last edit is not lost.
		void registerQuitFlush(() => queue.flush()).then((fn) =>
			disposed ? fn() : unlisteners.push(fn)
		);

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
			<TaskViewSwitcher {view} onview={changeView} />
			{#if task && settings.versioningEnabled}
				<Button
					bare
					class="size-6 rounded-md text-on-surface-variant hover:bg-surface-container/70 hover:text-on-surface"
					aria-label="Version history"
					onclick={() => (historyOpen = true)}
				>
					<History size={13} />
				</Button>
			{/if}
			{#each linkedNotes as note (note.id)}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								bare
								class="size-6 rounded-md text-on-surface-variant"
								aria-label="Open {note.title || 'Untitled note'}"
								onclick={() => void openNoteWindow(note.id)}
							>
								<NotebookPen size={13} />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Open {note.title || 'Untitled note'}</Tooltip.Content>
				</Tooltip.Root>
			{/each}
		{/snippet}
	</DetailWindowHeader>

	{#if task}
		{@const current = task}
		<TaskWindowBody
			task={current}
			{view}
			{folders}
			{notes}
			{customFolders}
			{allTasks}
			workspaceName={taskWorkspace.name}
			workspaceColor={taskWorkspace.color}
			{foreignWorkspace}
			autofocus={revealed}
			bind:title
			bind:detail
			bind:status
			bind:priority
			bind:folder
			bind:noteIds
			bind:startDate
			bind:dueDate
			onwikilink={handleWikiClick}
			onadddependency={(id) => addTaskDependency(current.id, id)}
			onremovedependency={removeTaskDependency}
		/>
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
	<AmbiguousWikiDialog
		bind:open={candidatesOpen}
		entities={candidateEntities}
		heading={pendingHeading}
		onselect={(entity, heading) => void wiki.open(entity, heading)}
	/>
	{#if task}
		<RecordHistoryDialog
			bind:open={historyOpen}
			entity="task"
			entityId={task.id}
			onrestore={restoreVersion}
		/>
	{/if}
</div>
