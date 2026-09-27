<script lang="ts">
	import { Network, ScanSearch } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import { statusMeta, type Task, type TaskDependency, type TaskStatus } from '$lib/stores/tasks';
	import { buildWorkspaceGraph, type GraphEdgeKind, type GraphNode } from '$lib/content/workspace-graph';
	import {
		GRAPH_TOKENS,
		graphColorHex,
		graphNodeColor,
		graphTokenColor,
		graphTokenHex,
	} from '$lib/components/graph/graph-palette';
	import { settings } from '$lib/stores/settings.svelte';
	import { Button, EmptyState, Input } from '$lib/components/base';
	import GraphCanvas from '$lib/components/graph/GraphCanvas.svelte';
	import GraphDrawer from '$lib/components/graph/GraphDrawer.svelte';

	let {
		notes,
		tasks,
		folders,
		dependencies = [],
		onopen,
	}: {
		notes: Note[];
		tasks: Task[];
		folders: CustomFolder[];
		dependencies?: TaskDependency[];
		onopen: (node: GraphNode) => void;
	} = $props();

	let query = $state('');
	let fitToken = $state(0);
	let hovered = $state<GraphNode | null>(null);
	let selected = $state<GraphNode | null>(null);
	let kinds = $state<Record<GraphEdgeKind, boolean>>({ wiki: true, dependency: true, link: true });

	const graph = $derived(buildWorkspaceGraph(notes, tasks, { folders, dependencies }));
	const normalized = $derived(query.trim().toLocaleLowerCase());
	const highlight = $derived(
		normalized
			? new Set(
					graph.nodes
						.filter((node) => node.title.toLocaleLowerCase().includes(normalized))
						.map((node) => node.id),
				)
			: null,
	);

	const active = $derived(hovered ?? selected);
	const themeToken = $derived(`${settings.mode}:${settings.accent}`);
	const statusText = $derived(
		active
			? `${active.kind === 'note' ? 'Note' : 'Task'} · ${active.title} · ${active.degree} ${
					active.degree === 1 ? 'link' : 'links'
				}`
			: 'Hover a node to inspect links · drag nodes to move · scroll to zoom',
	);
	const statusColor = $derived.by(() => {
		void themeToken;
		return graphColorHex(
			active ? graphNodeColor(active) : graphTokenColor(GRAPH_TOKENS.edges.link),
		);
	});

	const nodeLegend: { label: string; token: string }[] = [
		{ label: 'Note', token: GRAPH_TOKENS.note },
		...(['todo', 'doing', 'review', 'done'] as TaskStatus[]).map((status) => ({
			label: statusMeta[status].label,
			token: GRAPH_TOKENS.task[status],
		})),
	];

	const edgeLegend: { id: GraphEdgeKind; label: string; token: string }[] = [
		{ id: 'wiki', label: 'Wiki links', token: GRAPH_TOKENS.edges.wiki },
		{ id: 'link', label: 'Linked note', token: GRAPH_TOKENS.edges.link },
		{ id: 'dependency', label: 'Dependencies', token: GRAPH_TOKENS.edges.dependency },
	];

	/** Resolve a theme token to a hex colour, re-evaluated on theme changes. */
	function legendColor(token: string): string {
		void themeToken;
		return graphTokenHex(token);
	}
</script>

<section
	class="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface"
	style="background-image: radial-gradient(circle at 50% 32%, var(--glass-glow), transparent 42%);"
	aria-label="Workspace graph of notes and tasks"
>
	{#if !graph.nodes.length}
		<EmptyState
			size="md"
			icon={Network}
			heading="Nothing to graph yet"
			title="Create a note or task in this workspace to see it here."
			class="m-auto"
		/>
	{:else}
		<GraphCanvas
			nodes={graph.nodes}
			edges={graph.edges}
			{kinds}
			{highlight}
			selectedId={selected?.id ?? null}
			{fitToken}
			onselect={(node) => (selected = node)}
			onfocus={(node) => (hovered = node)}
		/>

		<!-- Compact header: a pill and the highlight search, nothing more. -->
		<div class="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
			<div
				class="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-on-surface"
			>
				<Network size={14} class="shrink-0 text-primary" />
				<span class="text-label-md font-medium">Workspace graph</span>
				<span class="hidden text-label-sm text-on-surface-variant sm:inline">
					{notes.length} notes · {tasks.length} tasks · {graph.edges.length} links
				</span>
			</div>
			<Input
				variant="well"
				size="sm"
				class="h-8 w-40 rounded-full px-3 sm:w-52"
				aria-label="Highlight graph nodes"
				placeholder="Highlight nodes"
				bind:value={query}
			>
			</Input>
		</div>

		<!-- Status pill, bottom-left. -->
		<div
			class="glass-chip absolute bottom-3 left-3 z-10 flex max-w-[calc(100%_-_24px)] items-center gap-2.5 rounded-full px-3.5 py-2 text-label-md text-on-surface"
		>
			<span
				class="size-[7px] shrink-0 rounded-full"
				style="background: {statusColor}; box-shadow: 0 0 14px {statusColor}"
			></span>
			<span class="truncate">{statusText}</span>
		</div>

		<!-- Legend panel, bottom-right; slides left while the drawer is open. -->
		<div
			class="glass-panel absolute bottom-3 z-10 w-60 rounded-2xl px-4 py-3 text-label-md text-on-surface-variant max-[720px]:hidden {selected
				? 'right-[308px] max-[1100px]:hidden'
				: 'right-3'}"
		>
			<p class="mb-2 text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
				Nodes
			</p>
			<div class="grid gap-2">
				{#each nodeLegend as item (item.label)}
					<div class="flex items-center gap-2.5">
						<span
							class="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
							style="background: {legendColor(item.token)}"
						></span>
						<span>{item.label}</span>
					</div>
				{/each}
			</div>

			<p class="mt-3 mb-1.5 text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
				Links
			</p>
			<div class="grid gap-0.5">
				{#each edgeLegend as item (item.id)}
					<Button
						variant="ghost"
						size="sm"
						class="h-auto w-full justify-start gap-2.5 rounded-lg px-1.5 py-1 text-label-md {kinds[
							item.id
						]
							? ''
							: 'opacity-40'}"
						aria-pressed={kinds[item.id]}
						onclick={() => (kinds = { ...kinds, [item.id]: !kinds[item.id] })}
					>
						<span
							class="h-[3px] w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
							style="background: {legendColor(item.token)}"
						></span>
						<span class="flex-1 text-left">{item.label}</span>
						<span class="text-on-surface-variant">{graph.counts[item.id]}</span>
					</Button>
				{/each}
			</div>

			<Button
				variant="secondary"
				size="sm"
				class="mt-3 w-full justify-center gap-1.5"
				onclick={() => (fitToken += 1)}
			>
				<ScanSearch size={13} /> Fit view
			</Button>
		</div>

		<GraphDrawer
			node={selected}
			nodes={graph.nodes}
			edges={graph.edges}
			onclose={() => (selected = null)}
			onselect={(node) => (selected = node)}
			onopen={onopen}
		/>
	{/if}
</section>
