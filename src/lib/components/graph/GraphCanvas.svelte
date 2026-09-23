<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
	import { settings } from '$lib/stores/settings.svelte';
	import { createGraphEngine, type GraphEngine } from '$lib/components/graph/graph-engine';

	let {
		nodes,
		edges,
		kinds,
		highlight = null,
		fitToken = 0,
		onopen,
	}: {
		nodes: GraphNode[];
		edges: GraphEdge[];
		kinds: Record<GraphEdgeKind, boolean>;
		highlight?: Set<string> | null;
		fitToken?: number;
		onopen: (node: GraphNode) => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let engine = $state<GraphEngine | null>(null);
	let ready = $state(false);
	let failed = $state(false);

	onMount(() => {
		let disposed = false;
		let created: GraphEngine | null = null;
		void createGraphEngine({ host: host!, onopen })
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
		// Re-read the CSS tokens whenever the app theme changes.
		void settings.mode;
		void settings.accent;
		engine?.setTheme();
	});

	$effect(() => {
		void fitToken;
		engine?.fit();
	});
</script>

<div bind:this={host} class="absolute inset-0" aria-label="Force-directed graph canvas"></div>
{#if !ready}
	<p class="absolute inset-0 grid place-items-center text-body-sm font-body text-outline">
		{failed ? 'Could not render the graph on this device.' : 'Laying out the graph…'}
	</p>
{/if}
