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

	// A new `focusId` flies the camera. Reading `focusToken` first means a pick
	// that arrives *while the engine is still loading* is honoured once it is
	// ready, instead of being lost: the effect re-runs when `engine` flips. The
	// "last frame was the requested token" latch below then re-picking the same
	// node (a new token) re-frames, while an unrelated re-run (a rebuild, a theme
	// change) is inert and cannot yank the camera back to a stale node.
	let framed: { nodeId: string; token: number } | null = null;
	$effect(() => {
		const token = focusToken;
		const nodeId = focusId;
		const current = engine;
		if (!current || !nodeId) return;
		if (framed?.nodeId === nodeId && framed.token === token) return;
		framed = { nodeId, token };
		current.focusNode(nodeId);
	});

	// When the node is selected but *not* framed — a connection picked from the
	// drawer — keeping the camera here does not help. Fly to it instead, with a
	// fresh `token` marker so the loop above does not frame it a second time.
	$effect(() => {
		const nodeId = selectedId;
		if (!nodeId) return;
		if (framed?.nodeId === nodeId && framed.token === focusToken) return;
		framed = { nodeId, token: focusToken };
		engine?.focusNode(nodeId);
	});

	// Losing the selection returns the orbit target to the middle of the layout,
	// so the camera does not stay pinned to a node the user has dismissed.
	$effect(() => {
		if (selectedId) return;
		engine?.resetView();
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
