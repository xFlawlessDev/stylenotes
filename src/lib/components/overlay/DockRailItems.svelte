<script lang="ts">
	import { ListTodo, Plus } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Task } from '$lib/stores/tasks';
	import { type DockEdge, type DockHover } from '$lib/dock';
	import { openWorkspace } from '$lib/windows';
	import { workspaceChipClass } from '$lib/workspace';
	import type { WorkspaceNameLookup } from '$lib/workspace-sync.svelte';
	import { Button } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import DockNoteButton from '$lib/components/overlay/DockNoteButton.svelte';
	import DockTaskButton from '$lib/components/overlay/DockTaskButton.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		notes,
		tasks,
		docked,
		edge,
		hovered,
		tooltipSide,
		workspaceFor,
		plusEl = $bindable<HTMLElement | undefined>(),
		onopennote,
		onopentask,
		onplus,
		onplusenter
	}: {
		notes: Note[];
		tasks: Task[];
		docked: number;
		edge: DockEdge;
		hovered: DockHover | null;
		tooltipSide: 'left' | 'right' | 'bottom';
		workspaceFor: WorkspaceNameLookup;
		plusEl?: HTMLElement | undefined;
		onopennote: (note: Note) => void;
		onopentask: (task: Task) => void;
		onplus: () => void;
		onplusenter: () => void;
	} = $props();

	const empty = $derived(notes.length === 0 && tasks.length === 0);
	/** Only worth labelling items when the dock actually mixes workspaces. */
	const multiWorkspace = $derived(
		new Set([
			...notes.map((note) => note.workspaceId ?? ''),
			...tasks.map((task) => task.workspaceId ?? '')
		]).size > 1
	);

	function workspaceTone(id: string | undefined): string {
		return workspaceChipClass(workspaceFor(id).color);
	}

	function workspaceName(id: string | undefined): string {
		return workspaceFor(id).name;
	}
</script>

<!-- Scrollable items: docked notes first, then tasks, then the rail divider. -->
<div
	data-ui="dock-rail"
	class="scrollbar-none flex items-center gap-2.5 {edge === 'top'
		? 'max-w-[168px] flex-row overflow-x-auto'
		: 'max-h-[168px] w-full flex-col overflow-y-auto'}"
>
	{#each notes as note (note.id)}
		<DockNoteButton
			{note}
			{edge}
			active={hovered?.kind === 'note' && hovered.note.id === note.id}
			workspace={multiWorkspace ? workspaceName(note.workspaceId) : ''}
			tone={workspaceTone(note.workspaceId)}
			onopen={onopennote}
		/>
	{/each}

	{#if notes.length > 0 && tasks.length > 0}
		<span
			class={edge === 'top'
				? 'mx-0.5 h-6 w-px shrink-0 bg-surface-container'
				: 'my-0.5 h-px w-6 shrink-0 bg-surface-container'}
		></span>
	{/if}

	{#each tasks as task (task.id)}
		<DockTaskButton
			{task}
			{edge}
			active={hovered?.kind === 'task' && hovered.task.id === task.id}
			workspace={multiWorkspace ? workspaceName(task.workspaceId) : ''}
			tone={workspaceTone(task.workspaceId)}
			onopen={onopentask}
		/>
	{/each}

	{#if empty}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="secondary"
						size="icon-lg"
						class="shrink-0 text-on-surface-variant"
						aria-label={docked > 0 ? t('over.noMatchTitle') : t('over.empty')}
						onclick={openWorkspace}
					>
						<ListTodo size={18} />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side={tooltipSide}>
				{docked > 0 ? t('over.noMatch') : t('over.empty')}
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>

<div
	class={edge === 'top' ? 'mx-0.5 h-6 w-px bg-surface-container' : 'my-0.5 h-px w-6 bg-surface-container'}
></div>

<!-- Hover opens the quick-capture menu (note or task). -->
<Button
	bind:ref={plusEl}
	variant="tonal"
	size="icon-lg"
	shape="tile"
	class="shrink-0 shadow-md hover:scale-105"
	aria-label={t('over.quickCapture')}
	onclick={onplus}
	onmouseenter={onplusenter}
>
	<Plus size={19} class="relative" />
</Button>
