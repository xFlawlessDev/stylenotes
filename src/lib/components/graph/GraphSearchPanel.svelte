<script lang="ts">
	import { onMount } from 'svelte';
	import { Search, Sparkles, X } from '@lucide/svelte';
	import type { GraphNode } from '$lib/content/workspace-graph';
	import { GRAPH_TOKENS, graphColorHex, graphNodeColor, graphTokenColor } from '$lib/components/graph/graph-palette';
	import { searchNodes, stepIndex } from '$lib/components/graph/graph-search';
	import { t } from '$lib/i18n/index.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { Button, Input } from '$lib/components/base';

	/** One semantic hit, as the memory store returns it. */
	export type SemanticHit = {
		entityKind: 'note' | 'task';
		entityId: string;
		score: number;
	};

	let {
		nodes,
		onpick,
		onclose,
		onsemantic,
		semanticReady = false,
	}: {
		nodes: GraphNode[];
		/** The chosen node; the caller focuses and selects it. */
		onpick: (node: GraphNode) => void;
		onclose: () => void;
		/**
		 * Meaning search, injected so this panel stays free of the memory store.
		 * Absent (or `semanticReady` false) hides the toggle.
		 */
		onsemantic?: (query: string) => Promise<SemanticHit[]>;
		semanticReady?: boolean;
	} = $props();

	let query = $state('');
	let active = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let meaning = $state(false);
	/** Semantic results, keyed by graph node id; empty while a query is pending. */
	let semanticHits = $state<{ node: GraphNode; score: number }[]>([]);
	let semanticPending = $state(false);

	const literal = $derived(searchNodes(nodes, query, meaning ? nodes.length : undefined));
	/** What the list actually shows: literal, or semantic when that mode is on. */
	const results = $derived(
		meaning ? semanticHits.map((hit) => ({ node: hit.node, score: hit.score })) : literal
	);
	const themeToken = $derived(`${settings.mode}:${settings.accent}`);
	const nodeColor = (node: GraphNode): string => {
		void themeToken;
		return graphColorHex(graphNodeColor(node));
	};
	const idleColor = $derived.by(() => {
		void themeToken;
		return graphColorHex(graphTokenColor(GRAPH_TOKENS.label));
	});

	// Clamp the highlight whenever the result set shrinks under it.
	$effect(() => {
		if (active >= results.length) active = Math.max(0, results.length - 1);
	});

	/**
	 * Meaning search runs on the query, debounced, only while that mode is on.
	 * Results map back to graph nodes by `<kind>:<id>`, dropping any hit whose
	 * entity is not in this graph.
	 */
	$effect(() => {
		const term = query.trim();
		const enabled = meaning;
		const run = onsemantic;
		if (!enabled || !run || !term) {
			semanticHits = [];
			semanticPending = false;
			return;
		}
		let cancelled = false;
		semanticPending = true;
		const timer = setTimeout(async () => {
			try {
				const hits = await run(term);
				if (cancelled) return;
				const byId = new Map(nodes.map((node) => [node.id, node]));
				semanticHits = hits
					.map((hit) => ({ node: byId.get(`${hit.entityKind}:${hit.entityId}`), score: hit.score }))
					.filter((entry): entry is { node: GraphNode; score: number } => Boolean(entry.node));
			} catch {
				if (!cancelled) semanticHits = [];
			} finally {
				if (!cancelled) semanticPending = false;
			}
		}, 220);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});

	onMount(() => input?.focus());

	function pick(node: GraphNode | undefined) {
		if (!node) return;
		onpick(node);
	}

	function toggleMeaning() {
		meaning = !meaning;
		active = 0;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = stepIndex(active, 1, results.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = stepIndex(active, -1, results.length);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			pick(results[active]?.node);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onclose();
		}
	}

	function label(node: GraphNode): string {
		return [
			node.kind === 'task' ? t('graph.node.task') : t('graph.node.note'),
			node.kind === 'task' && node.status ? t('tasks.statusLabel.' + node.status) : null,
			node.folder,
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<!-- Picking a node from the list is a deliberate act, so the panel takes clicks
	 and the backdrop dismisses it. -->
<div class="absolute inset-0 z-20" role="presentation" onclick={onclose}></div>

<div
	class="glass-solid absolute top-14 left-3 z-30 flex max-h-[min(480px,calc(100%-96px))] w-76 flex-col overflow-hidden rounded-2xl text-on-surface shadow-xl"
	role="dialog"
	aria-label={t('graph.search.title')}
>
	<div class="flex items-center gap-2 border-b border-outline-variant/50 px-3 py-2">
		<Search size={14} class="shrink-0 text-on-surface-variant" />
		<Input
			variant="bare"
			size="sm"
			class="h-8 flex-1"
			placeholder={meaning
				? t('graph.search.placeholderMeaning')
				: t('graph.search.placeholder')}
			aria-label={meaning
				? t('graph.search.placeholderMeaning')
				: t('graph.search.placeholder')}
			bind:value={query}
			{onkeydown}
			bind:ref={input}
		/>
		{#if semanticReady && onsemantic}
			<Button
				bare
				size="icon-xs"
				aria-label={t('graph.search.meaning')}
				aria-pressed={meaning}
				class={meaning ? 'text-tertiary' : 'text-on-surface-variant'}
				onclick={toggleMeaning}
			>
				<Sparkles size={14} />
			</Button>
		{/if}
		<Button bare size="icon-xs" aria-label={t('graph.search.close')} onclick={onclose}>
			<X size={14} />
		</Button>
	</div>

	<div class="scrollbar-none min-h-0 flex-1 overflow-y-auto p-1.5">
		{#if meaning && semanticPending && results.length === 0}
			<p class="px-2.5 py-4 text-center text-label-md text-on-surface-variant">
				{t('graph.search.searching')}
			</p>
		{/if}
		{#each results as item, index (item.node.id)}
			<button
				type="button"
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors {index ===
				active
					? 'bg-surface-container-high'
					: 'hover:bg-surface-container/60'}"
				onmouseenter={() => (active = index)}
				onclick={() => pick(item.node)}
			>
				<span
					class="size-2.5 shrink-0 rounded-full"
					style="background: {nodeColor(item.node)}"
				></span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-label-md text-on-surface">{item.node.title}</span>
					<span class="block truncate text-label-sm text-on-surface-variant">{label(item.node)}</span>
				</span>
				<span class="shrink-0 text-label-sm text-on-surface-variant">
					{meaning ? item.score.toFixed(2) : item.node.degree}
				</span>
			</button>
		{:else}
			{#if !(meaning && semanticPending)}
				<p class="px-2.5 py-4 text-center text-label-md text-on-surface-variant">
					{t('graph.search.empty')}
				</p>
			{/if}
		{/each}
	</div>

	<p class="border-t border-outline-variant/50 px-3 py-1.5 text-label-sm text-on-surface-variant">
		{meaning ? t('graph.search.hintMeaning') : t('graph.search.hint')}
	</p>
</div>

<span class="sr-only" style="color: {idleColor}"></span>
