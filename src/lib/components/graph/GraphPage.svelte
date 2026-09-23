<script lang="ts">
	import { Network, ScanSearch } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import type { Task, TaskDependency } from '$lib/stores/tasks';
	import { buildWorkspaceGraph, type GraphEdgeKind, type GraphNode } from '$lib/content/workspace-graph';
	import { Button, EmptyState, Input } from '$lib/components/base';
	import GraphCanvas from '$lib/components/graph/GraphCanvas.svelte';

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

	const legend: { id: GraphEdgeKind; label: string; dot: string }[] = [
		{ id: 'wiki', label: 'Wiki links', dot: 'bg-primary' },
		{ id: 'link', label: 'Linked note', dot: 'bg-tertiary' },
		{ id: 'dependency', label: 'Dependencies', dot: 'bg-secondary' },
	];
</script>

<section class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
	<header class="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-title-md font-title text-on-surface">Workspace graph</h2>
			<p class="text-body-sm text-on-surface-variant">
				{notes.length} notes · {tasks.length} tasks · {graph.edges.length} links
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			{#each legend as item (item.id)}
				<Button
					variant={kinds[item.id] ? 'secondary' : 'ghost'}
					size="sm"
					class="gap-1.5 text-label-sm"
					aria-pressed={kinds[item.id]}
					onclick={() => (kinds = { ...kinds, [item.id]: !kinds[item.id] })}
				>
					<span class="size-2 rounded-full {item.dot}"></span>
					{item.label}
					<span class="text-outline">{graph.counts[item.id]}</span>
				</Button>
			{/each}
			<Button variant="secondary" size="sm" class="gap-1.5 text-label-sm" onclick={() => (fitToken += 1)}>
				<ScanSearch size={14} /> Fit
			</Button>
		</div>
		<Input
			variant="well"
			size="sm"
			class="w-full sm:w-56"
			aria-label="Highlight graph nodes"
			placeholder="Highlight notes and tasks"
			bind:value={query}
		>
		</Input>
	</header>

	{#if !graph.nodes.length}
		<EmptyState
			size="md"
			icon={Network}
			heading="Nothing to graph yet"
			title="Create a note or task in this workspace to see it here."
		/>
	{:else}
		<div class="relative min-h-0 flex-1" aria-label="Workspace graph of notes and tasks">
			<GraphCanvas nodes={graph.nodes} edges={graph.edges} {kinds} {highlight} {fitToken} {onopen} />
		</div>
	{/if}
</section>
