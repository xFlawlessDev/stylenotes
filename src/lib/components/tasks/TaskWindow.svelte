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
		toDateInput,
		type Task,
		type TaskPriority,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { persistTask, refreshTasks, TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import {
		currentTaskId,
		isTauri,
		openNoteWindow,
		revealAndFocusCurrentWindow
	} from '$lib/windows';
	import DetailWindowHeader from '$lib/components/detail/DetailWindowHeader.svelte';
	import TaskFormFields from '$lib/components/tasks/TaskFormFields.svelte';
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
			loadFolders()
		]);
		notes = storedNotes;
		customFolders = storedFolders;
		task = tasks.find((item) => item.id === taskId) ?? null;
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
							<button
								{...props}
								type="button"
								class="flex size-6 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:text-on-surface"
								aria-label="Open linked note"
								onclick={() => task?.noteId && void openNoteWindow(task.noteId)}
							>
								<NotebookPen size={13} />
							</button>
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
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<div class="glass-well flex size-12 items-center justify-center rounded-2xl text-outline">
				<ListTodo size={22} />
			</div>
			<div class="flex flex-col gap-1">
				<h2 class="text-headline-sm font-headline text-on-surface">Task unavailable</h2>
				<p class="text-body-sm font-body text-outline">
					This task was deleted or could not be loaded.
				</p>
			</div>
			<button
				type="button"
				class="glass-chip rounded-xl px-3 py-1.5 text-label-md font-label text-on-surface-variant transition-colors hover:text-on-surface"
				onclick={closeWindow}
			>
				Close window
			</button>
		</div>
	{/if}
</div>
