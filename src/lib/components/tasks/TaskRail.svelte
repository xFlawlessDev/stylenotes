<script lang="ts">
	import { Circle, CircleCheck, CircleDashed, Eye, ListTodo, Plus, X } from '@lucide/svelte';
	import { Button, SearchInput } from '$lib/components/base';
	import type { Folder } from '$lib/stores/notes';
	import { TASK_STATUSES, statusMeta, taskStatus, type Task, type TaskStatus } from '$lib/stores/tasks';

	let {
		folders,
		tasks,
		countBase,
		activeFolder,
		activeStatus,
		query,
		open = false,
		onclose,
		oncreate,
		onselectfolder,
		onselectstatus,
		onquery
	}: {
		folders: Folder[];
		tasks: Task[];
		/** Tasks after query/priority/due but before folder/status — facet counts are derived from this. */
		countBase: Task[];
		activeFolder: string;
		activeStatus: TaskStatus | 'all';
		query: string;
		open?: boolean;
		onclose?: () => void;
		oncreate: () => void;
		onselectfolder: (id: string) => void;
		onselectstatus: (status: TaskStatus | 'all') => void;
		onquery: (value: string) => void;
	} = $props();

	function pickFolder(id: string) {
		onselectfolder(id);
		onclose?.();
	}

	function pickStatus(status: TaskStatus | 'all') {
		onselectstatus(status);
		onclose?.();
	}

	// Each facet is scoped only by the *other* active filters: status counts
	// respect the selected folder, folder counts respect the selected status,
	// so picking one option never zeroes out the rest of its own list.
	const counts = $derived.by(() => {
		const byFolder = new Map<string, number>();
		const byStatus = new Map<TaskStatus | 'all', number>([['all', 0]]);
		for (const status of TASK_STATUSES) byStatus.set(status, 0);
		for (const task of countBase) {
			const status = taskStatus(task);
			if (activeFolder === 'all' || task.folder === activeFolder) {
				byStatus.set('all', (byStatus.get('all') ?? 0) + 1);
				byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
			}
			if (activeStatus === 'all' || status === activeStatus) {
				byFolder.set(task.folder, (byFolder.get(task.folder) ?? 0) + 1);
			}
		}
		return { byFolder, byStatus };
	});

	const folderOptions = $derived([
		{ id: 'all', label: 'All folders' },
		...folders.filter((folder) => folder.id !== 'all')
	]);

	const statusIcons: Record<TaskStatus | 'all', typeof Circle> = {
		all: ListTodo,
		todo: Circle,
		doing: CircleDashed,
		review: Eye,
		done: CircleCheck
	};

	const statusTone: Record<TaskStatus | 'all', string> = {
		all: 'text-primary',
		todo: 'text-outline',
		doing: 'text-secondary',
		review: 'text-tertiary',
		done: 'text-primary'
	};
</script>

<aside
	class="glass-panel flex w-[248px] shrink-0 flex-col gap-3 overflow-hidden rounded-2xl p-2.5 max-lg:fixed max-lg:inset-y-2.5 max-lg:left-2.5 max-lg:z-40 max-lg:max-h-[calc(100vh-1.25rem)] max-lg:shadow-2xl max-lg:transition-transform {open
		? 'max-lg:translate-x-0'
		: 'max-lg:-translate-x-[120%]'}"
>
	<div class="flex items-center gap-2.5 px-1 py-1">
		<div
			class="flex size-9 items-center justify-center rounded-xl bg-surface-container-high/70 text-primary ring-1 ring-inset ring-hairline"
		>
			<ListTodo size={18} />
		</div>
		<div class="flex min-w-0 flex-col">
			<span class="text-headline-sm font-headline leading-tight text-on-surface">Tasks</span>
			<span class="text-label-sm font-label truncate text-outline">{tasks.length} in view</span>
		</div>
		<Button
			size="icon-sm"
			class="ml-auto text-outline lg:hidden"
			aria-label="Close task filters"
			onclick={onclose}
		>
			<X size={16} />
		</Button>
	</div>

	<Button
		variant="tonal"
		size="lg"
		shape="tile"
		block
		class="h-10 justify-between px-3 active:scale-[0.99]"
		onclick={() => {
			oncreate();
			onclose?.();
		}}
	>
		<span class="flex items-center gap-2">
			<Plus size={16} />
			<span class="text-label-md font-label font-semibold">New Task</span>
		</span>
	</Button>

	<SearchInput
		value={query}
		placeholder="Search tasks"
		ariaLabel="Search tasks"
		onquery={onquery}
	/>

	<div class="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain">
		<div class="flex flex-col gap-0.5">
			<div class="mb-1 flex items-center justify-between px-1">
				<p class="text-label-sm font-label tracking-wider text-outline uppercase">Status</p>
				{#if activeStatus !== 'all'}
					<span
						class="rounded-full bg-secondary-container/40 px-1.5 py-px text-code-sm font-code text-secondary"
						>active</span
					>
				{/if}
			</div>
			{#each [{ id: 'all' as const, label: 'All tasks' }, ...TASK_STATUSES.map((status) => ({ id: status, label: statusMeta[status].label }))] as item (item.id)}
				{@const Icon = statusIcons[item.id]}
				<Button
					variant={activeStatus === item.id ? 'tonal' : 'ghost'}
					size="md"
					class="justify-between rounded-xl px-2.5 text-left text-label-md"
					aria-pressed={activeStatus === item.id}
					onclick={() => pickStatus(item.id)}
				>
					<span class="flex items-center gap-2">
						<Icon size={15} class={statusTone[item.id]} />
						<span>{item.label}</span>
					</span>
					<span
						class="rounded-md px-1.5 py-px font-code text-code-sm {activeStatus === item.id
							? 'text-on-primary-container/80'
							: 'text-outline'}">{counts.byStatus.get(item.id) ?? 0}</span
					>
				</Button>
			{/each}
		</div>

		<div class="flex flex-col gap-0.5 border-t border-hairline pt-3">
			<div class="mb-1 flex items-center justify-between px-1">
				<p class="text-label-sm font-label tracking-wider text-outline uppercase">Folders</p>
				{#if activeFolder !== 'all'}
					<span
						class="rounded-full bg-primary-container/30 px-1.5 py-px text-code-sm font-code text-primary"
						>active</span
					>
				{/if}
			</div>
			<div
				class="scrollbar-none flex max-h-64 min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5"
			>
				{#each folderOptions as option (option.id)}
					<Button
						variant={activeFolder === option.id ? 'tonal' : 'ghost'}
						size="md"
						class="justify-between rounded-xl px-2.5 text-left text-label-md"
						aria-pressed={activeFolder === option.id}
						onclick={() => pickFolder(option.id)}
					>
						<span class="truncate">{option.label}</span>
						{#if option.id !== 'all'}
							<span
								class="rounded-md px-1.5 py-px font-code text-code-sm {activeFolder === option.id
									? 'text-primary/80'
									: 'text-outline'}">{counts.byFolder.get(option.id) ?? 0}</span
							>
						{/if}
					</Button>
				{/each}
			</div>
		</div>
	</div>
</aside>