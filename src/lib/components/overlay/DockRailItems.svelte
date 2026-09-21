<script lang="ts">
	import { ListTodo, Plus } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { Task } from '$lib/stores/tasks';
	import { type DockEdge, type DockHover } from '$lib/dock';
	import { openWorkspace } from '$lib/windows';
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
		plusEl?: HTMLElement | undefined;
		onopennote: (note: Note) => void;
		onopentask: (task: Task) => void;
		onplus: () => void;
		onplusenter: () => void;
	} = $props();

	const empty = $derived(notes.length === 0 && tasks.length === 0);
</script>

<!-- Scrollable items: docked notes first, then tasks, then the rail divider. -->
<div
	class="scrollbar-none flex items-center gap-2.5 {edge === 'top'
		? 'max-w-[168px] flex-row overflow-x-auto'
		: 'max-h-[168px] w-full flex-col overflow-y-auto'}"
>
	{#each notes as note (note.id)}
		<DockNoteButton
			{note}
			{edge}
			active={hovered?.kind === 'note' && hovered.note.id === note.id}
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
			onopen={onopentask}
		/>
	{/each}

	{#if empty}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						class="glass-chip flex size-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:text-on-surface"
						aria-label={docked > 0 ? 'No docked items match the dock filters' : 'Dock is empty'}
						onclick={openWorkspace}
					>
						<ListTodo size={18} />
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side={tooltipSide}>
				{docked > 0 ? 'No items match the dock filters' : 'Dock is empty'}
			</Tooltip.Content>
		</Tooltip.Root>
	{/if}
</div>

<div
	class={edge === 'top' ? 'mx-0.5 h-6 w-px bg-surface-container' : 'my-0.5 h-px w-6 bg-surface-container'}
></div>

<!-- Hover opens the quick-capture menu (note or task). -->
<button
	bind:this={plusEl}
	class="emphasis-container flex size-9 shrink-0 items-center justify-center rounded-2xl text-on-primary-container shadow-md ring-1 ring-inset ring-emphasis-container-ring transition-all hover:scale-105"
	aria-label="Quick capture: new note or task"
	onclick={onplus}
	onmouseenter={onplusenter}
>
	<Plus size={19} class="relative" />
</button>
