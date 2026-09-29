<script lang="ts">
	import type { GraphEdge, GraphNode } from '$lib/content/workspace-graph';
	import { GRAPH_TOKENS, graphColorHex, graphNodeColor, graphTokenColor } from '$lib/components/graph/graph-palette';
	import { t } from '$lib/i18n/index.svelte';
	import { settings } from '$lib/stores/settings.svelte';

	let {
		node,
		screen,
		nodes,
		edges,
		onopen,
	}: {
		node: GraphNode | null;
		/** Node position in client coordinates, from the engine. */
		screen: { x: number; y: number } | null;
		nodes: GraphNode[];
		edges: GraphEdge[];
		onopen: (node: GraphNode) => void;
	} = $props();

	const CARD_WIDTH = 232;
	const CARD_HEIGHT = 108;
	const GAP = 16;

	/** How many connections the card lists before it stops counting. */
	const MAX_ROWS = 3;

	const themeToken = $derived(`${settings.mode}:${settings.accent}`);
	const color = $derived.by(() => {
		void themeToken;
		return graphColorHex(node ? graphNodeColor(node) : graphTokenColor(GRAPH_TOKENS.label));
	});
	const nodeColor = (item: GraphNode): string => {
		void themeToken;
		return graphColorHex(graphNodeColor(item));
	};

	const connections = $derived.by(() => {
		if (!node) return [];
		const byId = new Map(nodes.map((item) => [item.id, item]));
		const found: { node: GraphNode; kind: GraphEdge['kind'] }[] = [];
		for (const edge of edges) {
			const other = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
			const target = other ? byId.get(other) : undefined;
			if (target) found.push({ node: target, kind: edge.kind });
		}
		return found;
	});

	const eyebrow = $derived(
		node
			? [
					node.kind === 'task' ? t('graph.node.task') : t('graph.node.note'),
					node.kind === 'task' && node.status ? t('tasks.statusLabel.' + node.status) : null,
					node.folder,
				]
					.filter(Boolean)
					.join(' · ')
			: '',
	);

	// Flip to the other side of the cursor near the viewport edges, so the card
	// never gets clipped by the window.
	const position = $derived.by(() => {
		if (!screen) return null;
		const flipX = screen.x + GAP + CARD_WIDTH > window.innerWidth;
		const flipY = screen.y + GAP + CARD_HEIGHT > window.innerHeight;
		return {
			left: `${Math.max(8, flipX ? screen.x - GAP - CARD_WIDTH : screen.x + GAP)}px`,
			top: `${Math.max(8, flipY ? screen.y - GAP - CARD_HEIGHT : screen.y + GAP)}px`,
		};
	});
</script>

{#if node && position && screen}
	<div
		class="glass-solid pointer-events-none fixed z-30 w-58 rounded-xl px-3 py-2.5 text-on-surface shadow-lg"
		style="left: {position.left}; top: {position.top};"
		role="tooltip"
	>
		<div class="flex items-start gap-2">
			<span
				class="mt-1.5 size-2.5 shrink-0 rounded-full"
				style="background: {color}; box-shadow: 0 0 12px {color}"
			></span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-label-sm font-bold tracking-[0.12em] text-on-surface-variant uppercase">
					{eyebrow}
				</p>
				<h4 class="truncate text-label-lg font-medium">{node.title}</h4>
			</div>
		</div>

		<div class="mt-2 grid gap-1">
			{#each connections.slice(0, MAX_ROWS) as item (`${item.kind}-${item.node.id}`)}
				<div class="flex items-center gap-2">
					<span class="size-1.5 shrink-0 rounded-full" style="background: {nodeColor(item.node)}"></span>
					<span class="min-w-0 flex-1 truncate text-label-sm">{item.node.title}</span>
					<span class="shrink-0 text-label-sm text-on-surface-variant">{t('graph.edge.' + item.kind)}</span>
				</div>
			{:else}
				<p class="text-label-sm text-on-surface-variant">{t('graph.hover.isolated')}</p>
			{/each}
			{#if connections.length > MAX_ROWS}
				<p class="text-label-sm text-on-surface-variant">
					{t('graph.hover.more', { count: connections.length - MAX_ROWS })}
				</p>
			{/if}
		</div>

		<p class="mt-2 border-t border-outline-variant/50 pt-1.5 text-label-sm text-on-surface-variant">
			{t('graph.hover.openHint', { action: t('graph.hover.doubleClick') })}
		</p>
	</div>
	<span class="sr-only">{t('graph.hover.a11y', { title: node.title, count: connections.length })}</span>
{/if}
