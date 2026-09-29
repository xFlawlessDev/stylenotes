<script lang="ts">
	import { FolderClosed, Inbox, Pencil, PictureInPicture2 } from '@lucide/svelte';
	import { Button, EmptyState, Select } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		priorityMeta,
		taskStatus,
		taskPriority,
		sortTasks,
		formatTaskDate,
		isTaskOverdue,
		type Task,
		type TaskStatus,
		TASK_STATUSES
	} from '$lib/stores/tasks';

	let {
		tasks,
		selectedId,
		noteTitles = {},
		folderLabels = {},
		onselect,
		onedit,
		onstatus,
		ontoggleoverlay
	}: {
		tasks: Task[];
		selectedId: string;
		noteTitles?: Record<string, string>;
		folderLabels?: Record<string, string>;
		onselect: (id: string) => void;
		onedit: (task: Task) => void;
		onstatus: (id: string, status: TaskStatus) => void;
		ontoggleoverlay: (task: Task) => void;
	} = $props();

	const ordered = $derived(sortTasks(tasks));

	const columns: { id: TaskStatus; label: string }[] = TASK_STATUSES.map((status) => ({
		id: status,
		label: t('tasks.statusLabel.' + status)
	}));

	let listEl = $state<HTMLElement>();

	$effect(() => {
		const id = selectedId;
		if (!id) return;
		listEl
			?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
			?.scrollIntoView({ block: 'nearest' });
	});
</script>

<section class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
	<div
		bind:this={listEl}
		class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto scrollbar-none pr-0.5"
	>
		{#each ordered as task (task.id)}
			{@const status = taskStatus(task)}
			{@const priority = priorityMeta[taskPriority(task)]}
			{@const priorityLabel = t('tasks.priorityLabel.' + taskPriority(task))}
			{@const folder = folderLabels[task.folder] ?? task.folder}
			<div
				data-task-id={task.id}
				class="group relative grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl px-3 py-2.5 transition-all sm:grid-cols-[auto_1fr_auto_auto] sm:gap-3 {selectedId ===
				task.id
					? 'glass-chip'
					: 'bg-surface-container-lowest/30 hover:bg-surface-container/50'}"
				role="button"
				tabindex="0"
				onclick={() => onselect(task.id)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onselect(task.id);
					}
				}}
			>
				{#if selectedId === task.id}
					<span class="emphasis-primary absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full"></span>
				{/if}

				<div onclick={(event) => event.stopPropagation()} role="presentation">
					<Select
						size="sm"
						label={t('tasks.status')}
						class="w-[130px] px-2 font-code text-code-sm"
						options={columns.map((column) => ({ value: column.id, label: column.label }))}
						value={status}
						onchange={(next) => onstatus(task.id, next as TaskStatus)}
					/>
				</div>

				<div class="min-w-0">
					<h3 class="truncate text-body-md font-body text-on-surface">{task.title}</h3>
					{#if task.notes}
						<p class="truncate text-code-sm font-code text-outline">{task.notes}</p>
					{/if}
				</div>

				<div class="hidden items-center gap-1.5 sm:flex">
					<span class="rounded-md px-1.5 py-px text-code-sm font-code {priority.tone}">
						{priorityLabel}
					</span>
					<span
						class="flex max-w-[120px] items-center gap-1 rounded-md bg-surface-container-high/60 px-1.5 py-px text-code-sm font-code text-tertiary"
						title={folder}
					>
						<FolderClosed size={11} class="shrink-0" />
						<span class="truncate">{folder}</span>
					</span>
					{#if task.dueAt}
						<span
							class="rounded-md px-1.5 py-px text-code-sm font-code {isTaskOverdue(task)
								? 'text-error'
								: 'text-outline'}"
						>
							{formatTaskDate(task.dueAt)}
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-0.5">
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-xs"
									variant="ghost"
									class="rounded-md {task.overlay
										? 'text-primary'
										: 'text-outline hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'}"
									aria-label={task.overlay ? t('over.taskCard.removeFromDock') : t('over.taskCard.addToDock')}
									aria-pressed={task.overlay}
									onclick={(event) => {
										event.stopPropagation();
										ontoggleoverlay(task);
									}}
								>
									<PictureInPicture2 size={14} />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							{task.overlay ? t('over.taskCard.removeFromDock') : t('over.taskCard.addToDock')}
						</Tooltip.Content>
					</Tooltip.Root>

					<Button
						size="icon-xs"
						variant="ghost"
						class="rounded-md text-outline hover:text-primary sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
						aria-label={t('tasks.list.edit')}
						onclick={(event) => {
							event.stopPropagation();
							onedit(task);
						}}
					>
						<Pencil size={14} />
					</Button>
				</div>
			</div>
		{/each}

		{#if ordered.length === 0}
			<EmptyState icon={Inbox} title={t('tasks.list.empty')} class="py-12" />
		{/if}
	</div>
</section>