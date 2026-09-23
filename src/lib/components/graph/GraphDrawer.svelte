<script lang="ts">
	import { ExternalLink, X } from '@lucide/svelte';
	import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
	import {
		GRAPH_EDGE_LABELS,
		graphColorHex,
		graphNodeColor,
	} from '$lib/components/graph/graph-palette';
	import { statusMeta } from '$lib/stores/tasks';
	import { Button } from '$lib/components/base';

	let {
		node,
		nodes,
		edges,
		onclose,
		onselect,
		onopen,
	}: {
		node: GraphNode | null;
		nodes: GraphNode[];
		edges: GraphEdge[];
		onclose: () => void;
		onselect: (node: GraphNode) => void;
		onopen: (node: GraphNode) => void;
	} = $props();

	type Connection = { node: GraphNode; kind: GraphEdgeKind; direction: 'out' | 'in' };

	const connections = $derived.by<Connection[]>(() => {
		if (!node) return [];
		const byId = new Map(nodes.map((item) => [item.id, item]));
		const result: Connection[] = [];
		for (const edge of edges) {
			if (edge.source === node.id) {
				const target = byId.get(edge.target);
				if (target) result.push({ node: target, kind: edge.kind, direction: 'out' });
			} else if (edge.target === node.id) {
				const source = byId.get(edge.source);
				if (source) result.push({ node: source, kind: edge.kind, direction: 'in' });
			}
		}
		return result;
	});

	const color = $derived(node ? graphColorHex(graphNodeColor(node)) : '#9ca7b6');
	const eyebrow = $derived(
		node
			? [
					node.kind === 'task' ? 'Task' : 'Note',
					node.kind === 'task' && node.status ? statusMeta[node.status].label : null,
					node.folder,
				]
					.filter(Boolean)
					.join(' · ')
			: '',
	);
</script>

{#if node}
	<aside
		class="absolute top-3 right-3 bottom-3 z-20 flex w-72 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080b11]/85 text-[#f6f7fb] shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl"
		aria-label="Node details"
	>
		<header class="flex items-start gap-2 border-b border-white/10 px-4 py-3">
			<span
				class="mt-1.5 size-2.5 shrink-0 rounded-full"
				style="background: {color}; box-shadow: 0 0 12px {color}"
			></span>
			<div class="min-w-0 flex-1">
				<p class="text-[10px] font-bold tracking-[0.14em] text-[#9ca7b6] uppercase">{eyebrow}</p>
				<h3 class="truncate text-[15px] font-semibold">{node.title}</h3>
				<p class="text-[11px] text-[#9ca7b6]">
					{connections.length}
					{connections.length === 1 ? 'connection' : 'connections'}
				</p>
			</div>
			<Button
				bare
				class="rounded-md p-1 text-[#9ca7b6] hover:bg-white/5 hover:text-[#f6f7fb]"
				aria-label="Close details"
				onclick={onclose}
			>
				<X size={15} />
			</Button>
		</header>

		<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3">
			<p class="mb-2 text-[10px] font-bold tracking-[0.14em] text-[#9ca7b6] uppercase">Connections</p>
			<div class="grid gap-1">
				{#each connections as item (`${item.direction}-${item.kind}-${item.node.id}`)}
					<div
						class="group flex items-center gap-0.5 rounded-lg border border-white/5 bg-white/[0.03] pr-1"
					>
						<Button
							bare
							class="min-w-0 flex-1 shrink justify-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/5"
							onclick={() => onselect(item.node)}
						>
							<span
								class="size-2 shrink-0 rounded-full"
								style="background: {graphColorHex(graphNodeColor(item.node))}"
							></span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[12px] text-[#f6f7fb]">{item.node.title}</span>
								<span class="block truncate text-[10px] text-[#9ca7b6]">
									{item.direction === 'out' ? '→' : '←'} {GRAPH_EDGE_LABELS[item.kind]}
								</span>
							</span>
						</Button>
						<Button
							bare
							class="rounded-md p-1.5 text-[#9ca7b6] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/5 hover:text-[#f6f7fb]"
							aria-label="Open {item.node.title}"
							onclick={() => onopen(item.node)}
						>
							<ExternalLink size={13} />
						</Button>
					</div>
				{/each}
				{#if !connections.length}
					<p class="text-[12px] leading-relaxed text-[#9ca7b6]">
						No links yet — this node is isolated in the graph.
					</p>
				{/if}
			</div>
		</div>

		<footer class="border-t border-white/10 p-3">
			<Button
				variant="ghost"
				class="w-full justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 text-[12px] text-[#f6f7fb] hover:bg-white/10 hover:text-[#f6f7fb]"
				onclick={() => onopen(node)}
			>
				<ExternalLink size={13} /> {node.kind === 'task' ? 'Open task' : 'Open note'}
			</Button>
		</footer>
	</aside>
{/if}
