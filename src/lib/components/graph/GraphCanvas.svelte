<script lang="ts">
	import { onMount } from 'svelte';
	import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
	import { createGraphEngine, type GraphEngine } from '$lib/components/graph/graph-engine';
	import { refreshGraphPalette } from '$lib/components/graph/graph-palette';
	import { t } from '$lib/i18n/index.svelte';
	import { settings } from '$lib/stores/settings.svelte';

	let {
		nodes,
		edges,
		kinds,
		highlight = null,
		selectedId = null,
		focusId = null,
		focusToken = 0,
		focusEdgeId = null,
		fitToken = 0,
		spinning = true,
		guides = false,
		onselect,
		onopen,
		onfocus,
	}: {
		nodes: GraphNode[];
		edges: GraphEdge[];
		kinds: Record<GraphEdgeKind, boolean>;
		highlight?: Set<string> | null;
		selectedId?: string | null;
		/** When set, the camera flies to that node. */
		focusId?: string | null;
		/** Bumping this re-applies `focusId`, so re-picking the same node re-frames. */
		focusToken?: number;
		/** When set, the camera frames that edge's full span. */
		focusEdgeId?: string | null;
		fitToken?: number;
		/** Idle auto-rotation around the layout. */
		spinning?: boolean;
		/** Show the decorative orbital rings. Off by default: they are not data. */
		guides?: boolean;
		onselect: (node: GraphNode | null) => void;
		/** Double-clicking a node opens it. */
		onopen?: (node: GraphNode) => void;
		onfocus?: (node: GraphNode | null, screen: { x: number; y: number } | null) => void;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let engine = $state<GraphEngine | null>(null);
	let ready = $state(false);
	let failed = $state(false);

	onMount(() => {
		let disposed = false;
		let created: GraphEngine | null = null;
		refreshGraphPalette();
		void createGraphEngine({ host: host!, onselect, onopen, onfocus })
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

	// A new `focusId` flies the camera; `undefined` is inert so clearing the
	// search does not move the view. `focusToken` makes a repeated pick re-frame.
	$effect(() => {
		void focusToken;
		if (focusId) engine?.focusNode(focusId);
	});

	// Framing an edge is a separate intent from selecting a node: it takes in the
	// whole span rather than one endpoint.
	$effect(() => {
		if (focusEdgeId) engine?.focusEdge(focusEdgeId);
	});

	$effect(() => {
		engine?.setAutoRotate(spinning);
	});

	$effect(() => {
		engine?.setGuidesVisible(guides);
	});

	$effect(() => {
		void fitToken;
		engine?.fit();
	});

	// Theme changes repaint the scene: resolve the tokens again, then re-tint.
	$effect(() => {
		void settings.mode;
		void settings.accent;
		refreshGraphPalette();
		engine?.refreshTheme();
	});
</script>

<div bind:this={host} class="absolute inset-0" aria-label={t('graph.canvas.ariaLabel')}></div>
{#if !ready}
	<p class="absolute inset-0 grid place-items-center text-[12px] text-on-surface-variant">
		{failed ? t('graph.failed') : t('graph.layingOut')}
	</p>
{/if}
