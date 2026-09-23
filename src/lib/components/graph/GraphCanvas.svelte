<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
	import { createGraphEngine, type GraphEngine } from '$lib/components/graph/graph-engine';

	let {
		nodes,
		edges,
		kinds,
		highlight = null,
		selectedId = null,
		fitToken = 0,
		onselect,
		onfocus,
	}: {
		nodes: GraphNode[];
		edges: GraphEdge[];
		kinds: Record<GraphEdgeKind, boolean>;
		highlight?: Set<string> | null;
		selectedId?: string | null;
		fitToken?: number;
		onselect: (node: GraphNode | null) => void;
		onfocus?: (node: GraphNode | null) => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let engine = $state<GraphEngine | null>(null);
	let ready = $state(false);
	let failed = $state(false);

	onMount(() => {
		let disposed = false;
		let created: GraphEngine | null = null;
		void createGraphEngine({ host: host!, onselect, onfocus })
			.then((next) => {
				if (disposed) {
					next.destroy();
					return;
				}
				created = next;
				engine = next;
				ready = true;
			})
			.catch(() => {
				ready = false;
				failed = true;
			});
		return () => {
			disposed = true;
			created?.destroy();
			engine = null;
			ready = false;
		};
	});

	$effect(() => {
		const current = engine;
		if (!current) return;
		current.update(nodes, edges);
	});

	$effect(() => {
		engine?.setHighlight(highlight);
	});

	$effect(() => {
		engine?.setVisibleKinds(kinds);
	});

	$effect(() => {
		engine?.setSelected(selectedId);
	});

	$effect(() => {
		void fitToken;
		engine?.fit();
	});
</script>

<div bind:this={host} class="absolute inset-0" aria-label="Force-directed graph canvas"></div>
{#if !ready}
	<p class="absolute inset-0 grid place-items-center text-[12px] text-[#9ca7b6]">
		{failed ? 'Could not render the graph on this device.' : 'Laying out the graph…'}
	</p>
{/if}
