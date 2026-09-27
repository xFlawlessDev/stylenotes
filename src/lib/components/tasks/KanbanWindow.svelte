<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { listen } from '@tauri-apps/api/event';
	import { Columns3, Lock, LockOpen, Minus, NotebookPen, X } from '@lucide/svelte';
	import { foldersFor } from '$lib/stores/notes';
	import {
		type Task,
		type TaskDependency,
		type TaskFormData,
		type TaskStatus
	} from '$lib/stores/tasks';
	import { TASKS_CHANGED } from '$lib/stores/tasks.svelte';
	import { settings, hydrateSettings } from '$lib/stores/settings.svelte';
	import {
		KANBAN_SHORTCUT_LABEL,
		listenKanbanLockChanged,
		toggleKanbanLock
	} from '$lib/stores/kanban.svelte';
	import { isTauri, openTasksInWorkspace } from '$lib/windows';
	import {
		hydrateWorkspaces,
		setActiveWorkspace,
		WORKSPACES_CHANGED,
		workspaceStore
	} from '$lib/stores/workspaces.svelte';
	import {
		boardStore,
		boardsFollowActive,
		nextBoardWorkspace,
		reconcileBoards,
		reloadBoards,
		setBoards,
		isSplit
	} from '$lib/stores/workspace-boards.svelte';
	import { notifyWorkspacesChanged } from '$lib/workspace-sync.svelte';
	import {
		addDependency,
		dependencyStore,
		DEPENDENCIES_CHANGED,
		refreshDependencies,
		removeDependency
	} from '$lib/stores/dependencies.svelte';
	import KanbanBoard from '$lib/components/tasks/KanbanBoard.svelte';
	import TaskDialog from '$lib/components/tasks/TaskDialog.svelte';
	import { Button } from '$lib/components/base';
	import * as Tooltip from '$lib/components/ui/tooltip';

	/**
	 * The window is a view over one or more boards, each showing a single
	 * workspace. A single board follows the app's active workspace; splitting
	 * adds boards and stops the window from following, because two boards
	 * cannot both track the same selection.
	 */
	let selectedId = $state('');
	let dialogOpen = $state(false);
	let editing = $state<Task | null>(null);
	let editingWorkspace = $state('');
	let defaultStatus = $state<TaskStatus>('todo');
	let notice = $state('');
	/** Bound to the open board so submissions land in the right workspace. */
	let boardRefs = $state<Record<string, ReturnType<typeof KanbanBoard> | undefined>>({});

	const workspaces = $derived(boardStore.workspaces);
	const split = $derived(isSplit());
	const locked = $derived(settings.kanbanLocked);
	/** Workspaces each board's picker can point at. */
	const boardChoices = $derived(
		workspaceStore.items.map((workspace) => ({
			value: workspace.id,
			label: workspace.name
		}))
	);
	const dialogTasks = $derived(
		editingWorkspace ? boardStore.boards[editingWorkspace]?.tasks ?? [] : []
	);
	const dialogNotes = $derived(
		editingWorkspace ? boardStore.boards[editingWorkspace]?.notes ?? [] : []
	);
	const dialogFolders = $derived(
		editingWorkspace
			? foldersFor(
					boardStore.boards[editingWorkspace]?.notes ?? [],
					boardStore.boards[editingWorkspace]?.folders ?? []
				)
			: []
	);

	function notify(message: string) {
		notice = message;
		setTimeout(() => {
			if (notice === message) notice = '';
		}, 2200);
	}

	/** Adds a board and points it at the first workspace not shown yet. */
	async function addBoard() {
		const next = nextBoardWorkspace();
		setBoards([...workspaces, next]);
		await reloadBoards();
		notify(`Split — showing ${workspaceStore.items.find((w) => w.id === next)?.name ?? 'another workspace'}`);
	}

	function openCreate(workspaceId: string, status: TaskStatus = 'todo') {
		editingWorkspace = workspaceId;
		editing = null;
		defaultStatus = status;
		dialogOpen = true;
	}

	function openEdit(workspaceId: string, task: Task) {
		editingWorkspace = workspaceId;
		editing = task;
		dialogOpen = true;
	}

	function closeBoard(workspaceId: string) {
		setBoards(workspaces.filter((id) => id !== workspaceId));
		if (!isSplit()) void applyActiveWorkspace();
	}

	function commitForm(data: TaskFormData) {
		boardRefs[editingWorkspace]?.applyForm(editing, data);
	}

	async function addTaskDependency(taskId: string, dependsOnTaskId: string): Promise<string | null> {
		return (await addDependency(taskId, dependsOnTaskId, dialogTasks))
			? null
			: 'Could not add dependency — it may be invalid or create a cycle.';
	}

	async function removeTaskDependency(dependency: TaskDependency): Promise<string | null> {
		return (await removeDependency(dependency)) ? null : 'Could not remove dependency.';
	}

	function syncDependencies() {
		void refreshDependencies();
	}

	/**
	 * Makes the single board follow the app's active workspace. A split window
	 * keeps its own boards instead: they are independent views.
	 */
	async function applyActiveWorkspace() {
		if (!boardsFollowActive()) return;
		setBoards([workspaceStore.activeId]);
		selectedId = '';
		await reloadBoards();
	}

	/**
	 * A single board is the app's workspace view: changing it moves the rest of
	 * the app too. A split window keeps its boards private, so nothing is
	 * announced from here.
	 */
	async function onBoardWorkspaceChanged(workspaceId: string) {
		if (isSplit()) return;
		if (await setActiveWorkspace(workspaceId)) notifyWorkspacesChanged();
		else notify('Workspace choice not saved — it may reset on restart');
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
			await hydrateSettings();
			setBoards(settings.kanbanBoards.length ? [...settings.kanbanBoards] : [workspaceStore.activeId]);
			await reloadBoards();
		})();

		let unlistenTasks: (() => void) | undefined;
		let unlistenDependencies: (() => void) | undefined;
		let unlistenLock: (() => void) | undefined;
		let unlistenWorkspaces: (() => void) | undefined;
		let disposed = false;
		if (isTauri) {
			void listen(TASKS_CHANGED, () => void reloadBoards()).then((fn) => {
				if (disposed) fn();
				else unlistenTasks = fn;
			});
			void listen(DEPENDENCIES_CHANGED, syncDependencies).then((fn) => {
				if (disposed) fn();
				else unlistenDependencies = fn;
			});
			void listen<{ activeId?: string }>(WORKSPACES_CHANGED, (event) => {
				const announced = event.payload?.activeId;
				void (async () => {
					// A workspace that was deleted must leave no ghost board.
					await reconcileBoards();
					if (!boardsFollowActive()) return;
					const target =
						announced && workspaceStore.items.some((w) => w.id === announced)
							? announced
							: workspaceStore.activeId;
					if (target !== boardStore.workspaces[0]) {
						setBoards([target]);
						await reloadBoards();
					}
				})();
			}).then((fn) => {
				if (disposed) fn();
				else unlistenWorkspaces = fn;
			});
			void listenKanbanLockChanged().then((fn) => {
				if (disposed) fn();
				else unlistenLock = fn;
			});
		}
		return () => {
			disposed = true;
			unlistenTasks?.();
			unlistenDependencies?.();
			unlistenLock?.();
			unlistenWorkspaces?.();
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
				{split ? `${workspaces.length} workspaces` : 'Following the app'}
			</span>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="shrink-0 text-outline hover:text-on-surface"
							aria-label="Add a board for another workspace"
							onclick={() => void addBoard()}
						>
							<Columns3 size={14} />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Split: add another workspace board</Tooltip.Content>
			</Tooltip.Root>
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

	<div class="flex min-h-0 flex-1 gap-1.5 overflow-x-auto">
		{#each workspaces as workspaceId, index (workspaceId)}
			<KanbanBoard
				bind:this={boardRefs[workspaceId]}
				{workspaceId}
				{index}
				choices={boardChoices}
				bind:selectedId
				onworkspacechange={onBoardWorkspaceChanged}
				onadd={openCreate}
				onedit={openEdit}
				onnotify={notify}
				onclose={closeBoard}
			/>
		{/each}
	</div>

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
	compact
	folders={dialogFolders}
	notes={dialogNotes}
	tasks={dialogTasks}
	dependencies={dependencyStore.items}
	onsubmit={commitForm}
	onadddependency={addTaskDependency}
	onremovedependency={removeTaskDependency}
/>
