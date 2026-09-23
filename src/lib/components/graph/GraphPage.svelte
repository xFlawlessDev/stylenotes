<script lang="ts">
	import { Network, ScanSearch } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import { statusMeta, type Task, type TaskDependency, type TaskStatus } from '$lib/stores/tasks';
	import { buildWorkspaceGraph, type GraphEdgeKind, type GraphNode } from '$lib/content/workspace-graph';
	import { GRAPH_COLORS, graphColorHex, graphNodeColor } from '$lib/components/graph/graph-palette';
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
	const statusText = $derived(
		active
			? `${active.kind === 'note' ? 'Note' : 'Task'} · ${active.title} · ${active.degree} ${
					active.degree === 1 ? 'link' : 'links'
				}`
			: 'Hover a node to inspect links · drag nodes to move · scroll to zoom',
	);
	const statusColor = $derived(
		active ? graphColorHex(graphNodeColor(active)) : graphColorHex(GRAPH_COLORS.edges.link),
	);

	const nodeLegend: { label: string; color: string }[] = [
		{ label: 'Note', color: graphColorHex(GRAPH_COLORS.note) },
		...(['todo', 'doing', 'review', 'done'] as TaskStatus[]).map((status) => ({
			label: statusMeta[status].label,
			color: graphColorHex(GRAPH_COLORS.task[status]),
		})),
	];

	const edgeLegend: { id: GraphEdgeKind; label: string; color: string }[] = [
		{ id: 'wiki', label: 'Wiki links', color: graphColorHex(GRAPH_COLORS.edges.wiki) },
		{ id: 'link', label: 'Linked note', color: graphColorHex(GRAPH_COLORS.edges.link) },
		{ id: 'dependency', label: 'Dependencies', color: graphColorHex(GRAPH_COLORS.edges.dependency) },
	];
</script>

<section
	class="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl"
	style="background: radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.035), transparent 38%), #05070b;"
	aria-label="Workspace graph of notes and tasks"
>
	{#if !graph.nodes.length}
		<EmptyState
			size="md"
			icon={Network}
			heading="Nothing to graph yet"
			title="Create a note or task in this workspace to see it here."
			class="m-auto [&_div]:text-[#9ca7b6] [&_h2]:text-[#f6f7fb] [&_p]:text-[#aeb7c5]"
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
				class="flex items-center gap-2 rounded-full border border-white/10 bg-[#080b11]/70 px-3 py-1.5 backdrop-blur-xl"
			>
				<Network size={14} class="shrink-0 text-[#71d2df]" />
				<span class="text-[12px] font-medium text-[#f6f7fb]">Workspace graph</span>
				<span class="hidden text-[11px] text-[#9ca7b6] sm:inline">
					{notes.length} notes · {tasks.length} tasks · {graph.edges.length} links
				</span>
			</div>
			<Input
				variant="bare"
				size="sm"
				class="h-8 w-40 rounded-full bg-[#080b11]/70 px-3 text-[12px] text-[#f6f7fb] ring-1 ring-white/10 placeholder:text-[#9ca7b6] focus-visible:ring-[#5484ff]/60 sm:w-52"
				aria-label="Highlight graph nodes"
				placeholder="Highlight nodes"
				bind:value={query}
			>
			</Input>
		</div>

		<!-- Status pill, bottom-left. -->
		<div
			class="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%_-_24px)] items-center gap-2.5 rounded-full border border-white/10 bg-[#080b11]/70 px-3.5 py-2 text-[12px] text-[#dce2eb] backdrop-blur-xl"
		>
			<span
				class="size-[7px] shrink-0 rounded-full"
				style="background: {statusColor}; box-shadow: 0 0 14px {statusColor}"
			></span>
			<span class="truncate">{statusText}</span>
		</div>

		<!-- Legend panel, bottom-right; slides left while the drawer is open. -->
		<div
			class="absolute bottom-3 z-10 w-60 rounded-[14px] border border-white/10 bg-[#080b11]/65 px-4 py-3 text-[12px] text-[#c4ccd7] backdrop-blur-xl max-[720px]:hidden {selected
				? 'right-[308px] max-[1100px]:hidden'
				: 'right-3'}"
		>
			<p class="mb-2 text-[10px] font-bold tracking-[0.14em] text-[#9ca7b6] uppercase">Nodes</p>
			<div class="grid gap-2">
				{#each nodeLegend as item (item.label)}
					<div class="flex items-center gap-2.5">
						<span
							class="size-[9px] shrink-0 rounded-full"
							style="background: {item.color}; box-shadow: 0 0 12px color-mix(in srgb, {item.color} 70%, transparent)"
						></span>
						<span>{item.label}</span>
					</div>
				{/each}
			</div>

			<p class="mt-3 mb-1.5 text-[10px] font-bold tracking-[0.14em] text-[#9ca7b6] uppercase">Links</p>
			<div class="grid gap-0.5">
				{#each edgeLegend as item (item.id)}
					<Button
						variant="ghost"
						size="sm"
						class="h-auto w-full justify-start gap-2.5 rounded-lg px-1.5 py-1 text-[12px] text-[#c4ccd7] hover:bg-white/5 hover:text-[#f6f7fb] {kinds[
							item.id
						]
							? ''
							: 'opacity-40'}"
						aria-pressed={kinds[item.id]}
						onclick={() => (kinds = { ...kinds, [item.id]: !kinds[item.id] })}
					>
						<span class="size-[9px] shrink-0 rounded-full" style="background: {item.color}"></span>
						<span class="flex-1 text-left">{item.label}</span>
						<span class="text-[#9ca7b6]">{graph.counts[item.id]}</span>
					</Button>
				{/each}
			</div>

			<Button
				variant="ghost"
				size="sm"
				class="mt-3 w-full justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] text-[#f6f7fb] hover:bg-white/10 hover:text-[#f6f7fb]"
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
