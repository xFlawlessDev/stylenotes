<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { emitTo, listen } from '@tauri-apps/api/event';
	import { ListTodo, NotebookPen } from '@lucide/svelte';
	import { createNote, type Note } from '$lib/content/content';
	import { foldersFor, listNotes, loadFolders, persistNote, type CustomFolder } from '$lib/stores/notes';
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
		taskNoteIds,
		toDateInput,
		type Task,
		type TaskDependency,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import {
		addDependency,
		dependencyStore,
		DEPENDENCIES_CHANGED,
		refreshDependencies,
		removeDependency
	} from '$lib/stores/dependencies.svelte';
	import {
		currentTaskId,
		isTauri,
		NOTE_HEADING_EVENT,
		NOTE_WINDOW_PREFIX,
		openNoteWindow,
		openTaskInWorkspace,
		revealAndFocusCurrentWindow
	} from '$lib/windows';
	import type { WikiClick, WikiEntity } from '$lib/content/wiki-links';
	import { planWikiClick } from '$lib/content/wiki-navigation';
	import { activeWorkspace, hydrateWorkspaces } from '$lib/stores/workspaces.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import TaskFormFields from '$lib/components/tasks/TaskFormFields.svelte';
	import DependencyEditor from '$lib/components/tasks/DependencyEditor.svelte';
	import BlockedIndicator from '$lib/components/tasks/BlockedIndicator.svelte';
	import AmbiguousWikiDialog from '$lib/components/dialogs/AmbiguousWikiDialog.svelte';
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
	let allTasks = $state<Task[]>([]);
	let candidateEntities = $state<WikiEntity[]>([]);
	let candidatesOpen = $state(false);
	let pendingHeading = $state<string | null>(null);

	const folders = $derived(foldersFor(notes, customFolders));
	const dateError = $derived(!!startDate && !!dueDate && dueDate < startDate);
	const linkedNotes = $derived(
		taskNoteIds({ noteId: task?.noteId ?? null, noteIds })
			.map((id) => notes.find((note) => note.id === id))
			.filter((note): note is Note => !!note)
	);
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
		noteIds = taskNoteIds(current);
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

	async function addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<string | null> {
		return (await addDependency(taskId, dependsOnTaskId, await refreshTasks()))
			? null
			: 'Dependency is invalid or would create a cycle.';
	}

	async function removeTaskDependency(dependency: TaskDependency): Promise<string | null> {
		return (await removeDependency(dependency)) ? null : 'Could not remove dependency.';
	}

	function showAmbiguous(entities: WikiEntity[], heading: string | null) {
		candidateEntities = entities;
		pendingHeading = heading;
		candidatesOpen = entities.length > 0;
	}

	async function openWikiTarget(entity: WikiEntity, heading: string | null) {
		await queue.flush();
		if (entity.kind === 'task') {
			await openTaskInWorkspace(entity.id);
			return;
		}
		await openNoteWindow(entity.id);
		if (heading) await emitTo(`${NOTE_WINDOW_PREFIX}${entity.id}`, NOTE_HEADING_EVENT, { heading });
	}

	async function handleWikiClick(click: WikiClick) {
		const current = task;
		if (!current) return;
		const plan = planWikiClick(click, current, notes, customFolders, allTasks);
		if (!plan) return;
		if (plan.status === 'open') {
			await openWikiTarget(plan.entity, plan.heading);
			return;
		}
		if (plan.status === 'choose') {
			showAmbiguous(plan.entities, plan.heading);
			return;
		}
		const created = createNote({
			title: plan.title,
			folder: plan.folder,
			workspaceId: current.workspaceId,
		});
		if (!(await persistNote(created))) return;
		notes = [created, ...notes];
		await openWikiTarget({ ...created, kind: 'note' }, plan.heading);
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

		void listen(DEPENDENCIES_CHANGED, () => void refreshDependencies()).then((fn) =>
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
		<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3">
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
				{task}
				tasks={allTasks}
				preview
				onwikilink={handleWikiClick}
				idPrefix="task-window"
				autofocus={revealed}
			/>
			<section class="flex flex-col gap-2 rounded-xl bg-surface-container-low/60 p-2.5">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-label-md font-label font-medium text-on-surface">Task dependencies</h2>
					<WorkspaceBadge name={activeWorkspace().name} color={activeWorkspace().color} />
					<BlockedIndicator
						blocked={isTaskBlocked(current, allTasks, dependencyStore.items)}
					/>
				</div>
				<DependencyEditor
					task={current}
					tasks={allTasks}
					dependencies={dependencyStore.items}
					onadd={(id) => addTaskDependency(current.id, id)}
					onremove={removeTaskDependency}
				/>
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
	<AmbiguousWikiDialog
		bind:open={candidatesOpen}
		entities={candidateEntities}
		heading={pendingHeading}
		onselect={(entity, heading) => void openWikiTarget(entity, heading)}
	/>
</div>
