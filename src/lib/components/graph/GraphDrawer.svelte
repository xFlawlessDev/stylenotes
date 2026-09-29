<script lang="ts">
	import { ExternalLink, X } from '@lucide/svelte';
	import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
	import {
		GRAPH_TOKENS,
		graphColorHex,
		graphNodeColor,
		graphTokenColor,
	} from '$lib/components/graph/graph-palette';
	import { t } from '$lib/i18n/index.svelte';
	import { settings } from '$lib/stores/settings.svelte';
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

	const themeToken = $derived(`${settings.mode}:${settings.accent}`);
	const color = $derived.by(() => {
		void themeToken;
		return graphColorHex(node ? graphNodeColor(node) : graphTokenColor(GRAPH_TOKENS.label));
	});
	const nodeColor = (item: GraphNode): string => {
		void themeToken;
		return graphColorHex(graphNodeColor(item));
	};
	const eyebrow = $derived(
		node
			? [
					node.kind === 'task' ? t('graph.node.task') : t('graph.node.note'),
					node.kind === 'task' && node.status
						? t('tasks.statusLabel.' + node.status)
						: null,
					node.folder,
				]
					.filter(Boolean)
					.join(' · ')
			: '',
	);
</script>

{#if node}
	<aside
		class="glass-solid absolute top-3 right-3 bottom-3 z-20 flex w-72 flex-col overflow-hidden rounded-2xl text-on-surface"
		aria-label={t('graph.drawer.title')}
	>
		<header class="flex items-start gap-2 border-b border-outline-variant/60 px-4 py-3">
			<span
				class="mt-1.5 size-2.5 shrink-0 rounded-full"
				style="background: {color}; box-shadow: 0 0 12px {color}"
			></span>
			<div class="min-w-0 flex-1">
				<p class="text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
					{eyebrow}
				</p>
				<h3 class="truncate text-headline-sm">{node.title}</h3>
				<p class="text-label-sm text-on-surface-variant">
					{connections.length === 1
						? t('graph.drawer.connectionOne', { count: connections.length })
						: t('graph.drawer.connectionMany', { count: connections.length })}
				</p>
			</div>
			<Button bare size="icon-sm" aria-label={t('graph.drawer.close')} onclick={onclose}>
				<X size={15} />
			</Button>
		</header>

		<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3">
			<p class="mb-2 text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
				{t('graph.drawer.connections')}
			</p>
			<div class="grid gap-1">
				{#each connections as item (`${item.direction}-${item.kind}-${item.node.id}`)}
					<div
						class="group flex items-center gap-0.5 rounded-lg border border-outline-variant/40 bg-surface-container-low/40 pr-1"
					>
						<Button
							bare
							class="min-w-0 flex-1 shrink justify-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-surface-container/60"
							onclick={() => onselect(item.node)}
						>
							<span
								class="size-2 shrink-0 rounded-full"
								style="background: {nodeColor(item.node)}"
							></span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-label-md text-on-surface">{item.node.title}</span>
								<span class="block truncate text-label-sm text-on-surface-variant">
									{item.direction === 'out' ? '→' : '←'} {t('graph.edge.' + item.kind)}
								</span>
							</span>
						</Button>
						<Button
							bare
							size="icon-xs"
							class="opacity-0 transition-opacity group-hover:opacity-100"
							aria-label={t('graph.drawer.open', { title: item.node.title })}
							onclick={() => onopen(item.node)}
						>
							<ExternalLink size={13} />
						</Button>
					</div>
				{/each}
				{#if !connections.length}
					<p class="text-label-md leading-relaxed text-on-surface-variant">
						{t('graph.drawer.isolated')}
					</p>
				{/if}
			</div>
		</div>

		<footer class="border-t border-outline-variant/60 p-3">
			<Button variant="secondary" class="w-full justify-center gap-1.5" onclick={() => onopen(node)}>
				<ExternalLink size={13} /> {node.kind === 'task' ? t('graph.drawer.openTask') : t('graph.drawer.openNote')}
			</Button>
		</footer>
	</aside>
{/if}
