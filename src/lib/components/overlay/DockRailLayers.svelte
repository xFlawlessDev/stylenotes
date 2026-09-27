<script lang="ts">
	import type { Note } from '$lib/content/content';
	import type { DockHover, DockPoint } from '$lib/dock';
	import type { QuickCaptureKind } from '$lib/stores/shortcuts';
	import type { Task } from '$lib/stores/tasks';
	import type { WorkspaceNameLookup } from '$lib/workspace-sync.svelte';
	import NoteDockCard from '$lib/components/overlay/NoteDockCard.svelte';
	import QuickCaptureMenu from '$lib/components/overlay/QuickCaptureMenu.svelte';
	import TaskDockCard from '$lib/components/overlay/TaskDockCard.svelte';

	let {
		hovered = $bindable<DockHover | null>(null),
		cardOffset,
		captureOpen,
		captureOffset,
		captureWorkspace = $bindable(''),
		cardEl = $bindable<HTMLElement | undefined>(),
		captureEl = $bindable<HTMLElement | undefined>(),
		onopennote,
		onopentask,
		onprogress,
		oncomplete,
		onremovetask,
		onremovenote,
		oncreate
	}: {
		hovered: DockHover | null;
		cardOffset: DockPoint;
		captureOpen: boolean;
		captureOffset: DockPoint;
		captureWorkspace?: string;
		cardEl?: HTMLElement | undefined;
		captureEl?: HTMLElement | undefined;
		onopennote: (note: Note) => void;
		onopentask: (task: Task) => void;
		onprogress: (task: Task) => void;
		oncomplete: (task: Task) => void;
		onremovetask: (task: Task) => void;
		onremovenote: (note: Note) => void;
		oncreate: (kind: QuickCaptureKind) => void;
	} = $props();
</script>

<!-- Item preview card. Raised above the rail: on the top edge the card overlaps
     the rail's lower strip and would otherwise be painted behind it. -->
{#if hovered?.kind === 'task'}
	{@const task = hovered.task}
	<div
		bind:this={cardEl}
		class="absolute z-20 w-72"
		style="left: {cardOffset.x}px; top: {cardOffset.y}px;"
	>
		<TaskDockCard
			{task}
			onopen={() => onopentask(task)}
			onprogress={onprogress}
			oncomplete={oncomplete}
			onremove={onremovetask}
			onclose={() => (hovered = null)}
		/>
	</div>
{:else if hovered?.kind === 'note'}
	{@const note = hovered.note}
	<div
		bind:this={cardEl}
		class="absolute z-20 w-72"
		style="left: {cardOffset.x}px; top: {cardOffset.y}px;"
	>
		<NoteDockCard
			{note}
			onopen={() => onopennote(note)}
			onremove={onremovenote}
			onclose={() => (hovered = null)}
		/>
	</div>
{/if}

<!-- Quick capture menu (hover the + button) -->
{#if captureOpen}
	<div
		bind:this={captureEl}
		class="absolute z-20 w-52"
		style="left: {captureOffset.x}px; top: {captureOffset.y}px;"
	>
		<QuickCaptureMenu {oncreate} />
	</div>
{/if}
