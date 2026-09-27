<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import { Button, Select } from '$lib/components/base';
	import {
		boardStore,
		boardTask,
		boardTasks,
		persistBoardTasks,
		setBoardWorkspace,
		closeBoard,
		isSplit
	} from '$lib/stores/workspace-boards.svelte';
	import { foldersFor } from '$lib/stores/notes';
	import {
		applyTaskPatch,
		moveTaskInList,
		taskStatus,
		type Task,
		type TaskFormData,
		type TaskStatus
	} from '$lib/stores/tasks';
	import CompactKanban from '$lib/components/tasks/CompactKanban.svelte';
	import WorkspaceBadge from '$lib/components/workspace/WorkspaceBadge.svelte';
	import { workspaceLookup } from '$lib/workspace-sync.svelte';
	import type { SelectOption } from '$lib/components/base';

	let {
		workspaceId,
		index,
		choices,
		selectedId = $bindable(''),
		onadd,
		onedit,
		onnotify,
		onclose,
		onworkspacechange
	}: {
		workspaceId: string;
		index: number;
		choices: SelectOption[];
		selectedId?: string;
		onadd: (workspaceId: string, status: TaskStatus) => void;
		onedit: (workspaceId: string, task: Task) => void;
		onnotify: (message: string) => void;
		onclose: (workspaceId: string) => void;
		/** The board moved to another workspace (only the single board announces it). */
		onworkspacechange?: (workspaceId: string) => void;
	} = $props();

	const data = $derived(boardStore.boards[workspaceId]);
	const tasks = $derived(boardTasks(workspaceId));
	const notes = $derived(data?.notes ?? []);
	const customFolders = $derived(data?.folders ?? []);
	const workspace = $derived(workspaceLookup()(workspaceId));

	const folders = $derived(foldersFor(notes, customFolders));
	const folderOptions = $derived([
		{ value: 'all', label: 'All folders' },
		...folders
			.filter((folder) => folder.id !== 'all')
			.map((folder) => ({ value: folder.id, label: folder.label }))
	]);
	const noteTitles = $derived(
		Object.fromEntries(notes.map((note) => [note.id, note.title || 'Untitled note']))
	);
	let folderFilter = $state('all');
	const visibleTasks = $derived(
		folderFilter === 'all' ? tasks : tasks.filter((task) => task.folder === folderFilter)
	);
	const openCount = $derived(visibleTasks.filter((task) => taskStatus(task) !== 'done').length);

	async function write(next: Task[], message: string) {
		if (!(await persistBoardTasks(workspaceId, next))) {
			onnotify('Could not save task — changes may be lost');
			return;
		}
		if (message) onnotify(message);
	}

	/** Applies a form submission from the shared task dialog. */
	export function applyForm(task: Task | null, data: TaskFormData) {
		if (task) {
			const next = tasks.map((item) =>
				item.id === task.id ? applyTaskPatch(item, data) : item
			);
			void write(next, 'Task updated');
			return;
		}
		const created = boardTask(workspaceId, tasks, data);
		selectedId = created.id;
		void write([created, ...tasks], 'Task created');
	}

	function move(id: string, status: TaskStatus, beforeId: string | null) {
		void write(moveTaskInList(tasks, id, status, beforeId, workspaceId), '');
	}

	function changeFolder(next: string) {
		folderFilter = next;
	}
</script>

<section
	class="glass-panel flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-2xl p-2"
	aria-label="Kanban board: {workspace.name}"
>
	<header class="flex shrink-0 items-center gap-2 px-0.5">
		<WorkspaceBadge name={workspace.name} color={workspace.color} />
		<span class="shrink-0 text-code-sm font-code text-outline">
			{openCount} open · {visibleTasks.length} total
		</span>
		<div class="ml-auto flex min-w-0 shrink items-center gap-1.5">
			<Select
				size="sm"
				label="Board workspace"
				class="w-[120px] px-2 font-code text-code-sm"
				options={choices}
				value={workspaceId}
				onchange={(id) => {
					setBoardWorkspace(index, id);
					selectedId = '';
					folderFilter = 'all';
					onworkspacechange?.(id);
				}}
			/>
			<Select
				size="sm"
				label="Filter tasks by folder"
				class="hidden w-[112px] px-2 font-code text-code-sm @[620px]:block"
				options={folderOptions}
				bind:value={folderFilter}
			/>
			{#if isSplit()}
				<Button
					bare
					class="size-6 shrink-0 rounded-md text-outline hover:bg-error-container/40 hover:text-error"
					aria-label="Close {workspace.name} board"
					onclick={() => onclose(workspaceId)}
				>
					<X size={13} />
				</Button>
			{/if}
		</div>
	</header>

	<CompactKanban
		tasks={visibleTasks}
		{selectedId}
		{noteTitles}
		onselect={(id) => (selectedId = id)}
		onedit={(task) => onedit(workspaceId, task)}
		onmove={move}
		onadd={(status) => onadd(workspaceId, status)}
	/>
</section>
