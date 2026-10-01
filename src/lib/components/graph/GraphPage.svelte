<script lang="ts">
	import { Network, Pause, Play, ScanSearch, Search, Sparkles } from '@lucide/svelte';
	import type { Note } from '$lib/content/content';
	import type { CustomFolder } from '$lib/stores/notes';
	import { type Task, type TaskDependency, type TaskStatus } from '$lib/stores/tasks';
	import { buildWorkspaceGraph, defaultEdgeKinds, type GraphEdgeKind, type GraphNode, type GraphSuggestion } from '$lib/content/workspace-graph';
	import {
		GRAPH_TOKENS,
		graphColorHex,
		graphNodeColor,
		graphTokenColor,
		graphTokenHex,
		themeClusterColor,
	} from '$lib/components/graph/graph-palette';
	import { settings } from '$lib/stores/settings.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Button, EmptyState } from '$lib/components/base';
	import GraphCanvas from '$lib/components/graph/GraphCanvas.svelte';
	import GraphDrawer from '$lib/components/graph/GraphDrawer.svelte';
	import GraphHoverCard from '$lib/components/graph/GraphHoverCard.svelte';
	import GraphSearchPanel from '$lib/components/graph/GraphSearchPanel.svelte';
	import GraphSuggestionsPopover from '$lib/components/graph/GraphSuggestionsPopover.svelte';
	import GraphThemeLegend from '$lib/components/graph/GraphThemeLegend.svelte';

	let {
		notes,
		tasks,
		folders,
		dependencies = [],
		suggestions = [],
		pendingSuggestions = [],
		themes = [],
		onbuildthemes,
		onsemantic,
		semanticReady = false,
		onopen,
		onacceptsuggestion,
		onrejectsuggestion,
	}: {
		notes: Note[];
		tasks: Task[];
		folders: CustomFolder[];
		dependencies?: TaskDependency[];
		/** Accepted + pending suggestions, so the graph can draw both (#D7). */
		suggestions?: GraphSuggestion[];
		pendingSuggestions?: GraphSuggestion[];
		themes?: import('$lib/db/clusters').ClusterRecord[];
		onbuildthemes?: () => void;
		/** Meaning search for the panel, injected from the memory store (#D11). */
		onsemantic?: (query: string) => Promise<{ entityKind: 'note' | 'task'; entityId: string; score: number }[]>;
		semanticReady?: boolean;
		onopen: (node: GraphNode) => void;
		onacceptsuggestion?: (id: string) => void;
		onrejectsuggestion?: (id: string) => void;
	} = $props();

	let fitToken = $state(0);
	let hovered = $state<GraphNode | null>(null);
	let hoverScreen = $state<{ x: number; y: number } | null>(null);
	let selected = $state<GraphNode | null>(null);
	let focusNodeId = $state<string | null>(null);
	let focusToken = $state(0);
	let spinning = $state(true);
	/** Decorative orbit rings: off by default, since they are not data. */
	let guides = $state(false);
	let searchOpen = $state(false);
	let suggestionsOpen = $state(false);
	let selectedTheme = $state<number | null>(null);
	let kinds = $state<Record<GraphEdgeKind, boolean>>(defaultEdgeKinds());

	/**
	 * Keyboard hint for the search trigger. Not translated: a keybinding is not
	 * copy, and the modifier differs per platform. `Ctrl/Cmd+F` rather than
	 * `Ctrl/Cmd+K`: the latter already opens the app-wide command palette
	 * (workspace-controller `onGlobalKeydown`) and inserts an editor link, so it
	 * would fire two handlers at once on the graph page.
	 */
	const SEARCH_SHORTCUT =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘F' : 'Ctrl+F';

	const graph = $derived(buildWorkspaceGraph(notes, tasks, { folders, dependencies, suggestions }));
	/** Node id → title, so a suggestion can name both ends without a lookup. */
	const titleById = $derived.by(() => {
		const map = new Map<string, string>();
		for (const node of graph.nodes) map.set(node.id, node.title);
		return map;
	});

	function suggestionTitle(suggestion: GraphSuggestion, end: 'source' | 'target'): string {
		const kind = end === 'source' ? suggestion.sourceKind : suggestion.targetKind;
		const id = end === 'source' ? suggestion.sourceId : suggestion.targetId;
		return titleById.get(`${kind}:${id}`) ?? id;
	}
	const highlight = $derived(selected ? new Set([selected.id]) : null);

	/**
	 * The colour override for the selected theme, or null when none is chosen.
	 *
	 * Every member node of the cluster gets the same colour, computed from the
	 * cluster's index so it matches the legend swatch exactly. This is the only
	 * thing a theme click does — it never moves a node.
	 */
	const themeColors = $derived.by(() => {
		if (selectedTheme === null) return null;
		const index = themes.findIndex((theme) => theme.clusterId === selectedTheme);
		if (index < 0) return null;
		const color = themeClusterColor(index);
		const map = new Map<string, number>();
		for (const member of themes[index].members) {
			map.set(`${member.entityKind}:${member.entityId}`, color);
		}
		return map;
	});

	const active = $derived(hovered ?? selected);
	const themeToken = $derived(`${settings.mode}:${settings.accent}`);
	const statusText = $derived(
		active
			? active.degree === 1
				? t('graph.statusActive', {
						kind: active.kind === 'note' ? t('graph.node.note') : t('graph.node.task'),
						title: active.title,
						count: active.degree
					})
				: t('graph.statusActivePlural', {
						kind: active.kind === 'note' ? t('graph.node.note') : t('graph.node.task'),
						title: active.title,
						count: active.degree
					})
			: t('graph.statusIdle'),
	);
	const statusColor = $derived.by(() => {
		void themeToken;
		return graphColorHex(
			active ? graphNodeColor(active) : graphTokenColor(GRAPH_TOKENS.edges.link),
		);
	});

	/**
	 * Node legend rows. `$derived.by` rather than a plain array: `t()` must be
	 * re-read on every render or the labels stay in the language they were
	 * first built in (AGENTS: never cache a translated string).
	 */
	const nodeLegend = $derived.by((): { label: string; token: string }[] => [
		{ label: t('graph.node.note'), token: GRAPH_TOKENS.note },
		...(['todo', 'doing', 'review', 'done'] as TaskStatus[]).map((status) => ({
			label: t('tasks.statusLabel.' + status),
			token: GRAPH_TOKENS.task[status],
		})),
	]);

	/** Kinds that only earn a legend row once one of them actually exists. */
	const LATE_EDGE_KINDS: GraphEdgeKind[] = ['semantic', 'contradicts'];

	/**
	 * Link legend rows. The swatch here and the ribbon on the canvas resolve the
	 * same `graphEdgeColor(kind)` token, so they cannot drift apart: the legend
	 * promises `--graph-edge-dependency` pink, the canvas draws it.
	 * `semantic`/`contradicts` (accepted suggestions) are appended when their
	 * count is non-zero — a "Contradicts 0" toggle on a graph that has never
	 * produced one is noise.
	 */
	const edgeLegend = $derived.by((): { id: GraphEdgeKind; label: string; token: string }[] => {
		const rows: { id: GraphEdgeKind; label: string; token: string }[] = [
			{ id: 'wiki', label: t('graph.edge.wiki'), token: GRAPH_TOKENS.edges.wiki },
			{ id: 'link', label: t('graph.edge.link'), token: GRAPH_TOKENS.edges.link },
			{ id: 'dependency', label: t('graph.edge.dependency'), token: GRAPH_TOKENS.edges.dependency },
			{ id: 'related', label: t('graph.edge.related'), token: GRAPH_TOKENS.edges.related },
		];
		for (const id of LATE_EDGE_KINDS) {
			if (graph.counts[id] > 0) {
				rows.push({ id, label: t('graph.edge.' + id), token: GRAPH_TOKENS.edges[id] });
			}
		}
		return rows;
	});

	/** Resolve a theme token to a hex colour, re-evaluated on theme changes. */
	function legendColor(token: string): string {
		void themeToken;
		return graphTokenHex(token);
	}

	/**
	 * Choosing from the search list selects the node and flies to it, so a hit on
	 * the far side of the orbited layout is still visible.
	 */
	function pickNode(node: GraphNode) {
		selected = node;
		// Bumping the token re-frames even when the same node is picked twice.
		focusNodeId = node.id;
		focusToken += 1;
		searchOpen = false;
	}

	/** Dismiss the hover card whenever a selection takes over the scene. */
	function selectNode(node: GraphNode | null) {
		selected = node;
		if (node) {
			hovered = null;
			hoverScreen = null;
		}
	}

	/**
	 * Accepting a suggestion also switches its kind on in the legend. The
	 * suggestion kinds start hidden (`defaultEdgeKinds`) so a fresh index does
	 * not redraw the graph without being asked — but a link the user just
	 * accepted must appear at once, or the button reads as if it did nothing.
	 */
	function acceptSuggestion(id: string) {
		const suggestion = pendingSuggestions.find((item) => item.id === id);
		if (suggestion) {
			const next = { ...kinds };
			next[suggestion.kind] = true;
			kinds = next;
		}
		onacceptsuggestion?.(id);
	}

	function onHover(node: GraphNode | null, screen: { x: number; y: number } | null) {
		hovered = node;
		hoverScreen = node ? screen : null;
	}

	// Ctrl/Cmd+F opens the graph search list. Ctrl/Cmd+K is deliberately left to
	// the app-wide command palette, so the two do not fight on this page.
	function onkeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLocaleLowerCase() === 'f') {
			event.preventDefault();
			searchOpen = true;
		}
	}
</script>

<svelte:window {onkeydown} />

<section
	class="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface"
	style="background-image: radial-gradient(circle at 50% 32%, var(--glass-glow), transparent 42%);"
	aria-label="Workspace graph of notes and tasks"
>
	{#if !graph.nodes.length}
		<EmptyState
			size="md"
			icon={Network}
			heading={t('graph.emptyHeading')}
			title={t('graph.emptyTitle')}
			class="m-auto"
		/>
	{:else}
		<GraphCanvas
			nodes={graph.nodes}
			edges={[...graph.edges, ...graph.suggestions]}
			{kinds}
			{highlight}
			selectedId={selected?.id ?? null}
			focusId={focusNodeId}
			{focusToken}
			{fitToken}
			{spinning}
			{guides}
			{themeColors}
			onselect={selectNode}
			onopen={onopen}
			onfocus={onHover}
		/>

		<GraphHoverCard node={hoverScreen ? hovered : null} screen={hoverScreen} nodes={graph.nodes} edges={graph.edges} onopen={onopen} />

		<!-- Compact header: a pill and the search trigger, nothing more. -->
		<div class="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
			<div
				class="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-on-surface"
			>
				<Network size={14} class="shrink-0 text-primary" />
				<span class="text-label-md font-medium">{t('graph.pageTitle')}</span>
				<span class="hidden text-label-sm text-on-surface-variant sm:inline">
					{t('graph.pageStats', {
						notes: notes.length,
						tasks: tasks.length,
						links: graph.edges.length
					})}
				</span>
			</div>
			<Button
				variant="secondary"
				size="sm"
				class="h-8 gap-2 rounded-full px-3"
				aria-expanded={searchOpen}
				onclick={() => (searchOpen = !searchOpen)}
			>
				<Search size={13} />
				<span>{t('graph.search.trigger')}</span>
				<kbd
					class="hidden rounded border border-outline-variant/60 px-1 text-label-sm text-on-surface-variant sm:inline"
				>
					{SEARCH_SHORTCUT}
				</kbd>
			</Button>
			{#if pendingSuggestions.length && onacceptsuggestion && onrejectsuggestion}
				<Button
					variant="secondary"
					size="sm"
					class="h-8 gap-2 rounded-full px-3"
					aria-expanded={suggestionsOpen}
					onclick={() => (suggestionsOpen = !suggestionsOpen)}
				>
					<Sparkles size={13} class="text-tertiary" />
					<span>{t('graph.suggestion.badge', { count: pendingSuggestions.length })}</span>
				</Button>
			{/if}
		</div>

		{#if searchOpen}
			<GraphSearchPanel
				nodes={graph.nodes}
				onpick={pickNode}
				onclose={() => (searchOpen = false)}
				{onsemantic}
				{semanticReady}
			/>
		{/if}
		<!-- Theme legend (#D9): colours by cluster, never rearranges the layout. -->
		{#if onbuildthemes}
			<div class="absolute top-3 left-3 z-10 max-[720px]:hidden" style="transform: translateY(3rem)">
				<GraphThemeLegend
					{themes}
					selected={selectedTheme}
					onselect={(id) => (selectedTheme = id)}
					onbuild={onbuildthemes}
				/>
			</div>
		{/if}

		<!-- Pending auto-link suggestions behind a badge, so they never cover the
			 graph they are about (#D7). -->
		{#if pendingSuggestions.length && onacceptsuggestion && onrejectsuggestion}
			<GraphSuggestionsPopover
				open={suggestionsOpen}
				suggestions={pendingSuggestions}
				sourceTitle={(item) => suggestionTitle(item, 'source')}
				targetTitle={(item) => suggestionTitle(item, 'target')}
				onaccept={acceptSuggestion}
				onreject={(id) => onrejectsuggestion?.(id)}
				onclose={() => (suggestionsOpen = false)}
			/>
		{/if}

		<!-- Status pill, bottom-left. -->
		<div
			class="glass-chip absolute bottom-3 left-3 z-10 flex max-w-[calc(100%_-_24px)] items-center gap-2.5 rounded-full px-3.5 py-2 text-label-md text-on-surface"
		>
			<span
				class="size-[7px] shrink-0 rounded-full"
				style="background: {statusColor}; box-shadow: 0 0 14px {statusColor}"
			></span>
			<span class="truncate">{statusText}</span>
		</div>

		<!-- Legend panel, bottom-right; slides left while the drawer is open. -->
		<div
			class="glass-panel absolute bottom-3 z-10 w-60 rounded-2xl px-4 py-3 text-label-md text-on-surface-variant max-[720px]:hidden {selected
				? 'right-[308px] max-[1100px]:hidden'
				: 'right-3'}"
		>
			<p class="mb-2 text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
				{t('graph.nodes')}
			</p>
			<div class="grid gap-2">
				{#each nodeLegend as item (item.label)}
					<div class="flex items-center gap-2.5">
						<span
							class="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
							style="background: {legendColor(item.token)}"
						></span>
						<span>{item.label}</span>
					</div>
				{/each}
			</div>

			<p class="mt-3 mb-1.5 text-label-sm font-bold tracking-[0.14em] text-on-surface-variant uppercase">
				{t('graph.links')}
			</p>
			<div class="grid gap-0.5">
				{#each edgeLegend as item (item.id)}
					<Button
						variant="ghost"
						size="sm"
						class="h-auto w-full justify-start gap-2.5 rounded-lg px-1.5 py-1 text-label-md {kinds[
							item.id
						]
							? ''
							: 'opacity-40'}"
						aria-pressed={kinds[item.id]}
						onclick={() => (kinds = { ...kinds, [item.id]: !kinds[item.id] })}
					>
						<span
							class="h-[3px] w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
							style="background: {legendColor(item.token)}"
						></span>
						<span class="flex-1 text-left">{item.label}</span>
						<span class="text-on-surface-variant">{graph.counts[item.id]}</span>
					</Button>
				{/each}
			</div>

			<!--
				"Related" counts accepted edges only, which is why it reads 0 until a
				suggestion is accepted. The pending count is shown separately so the
				zero is not mistaken for "the feature found nothing".
			-->
			{#if pendingSuggestions.length}
				<p class="mt-2 text-label-sm text-outline">
					{t('graph.suggestion.count', { count: pendingSuggestions.length })}
				</p>
			{/if}

			<div class="mt-3 grid grid-cols-2 gap-2">
				<Button
					variant="secondary"
					size="sm"
					class="justify-center gap-1.5"
					onclick={() => (fitToken += 1)}
				>
					<ScanSearch size={13} /> {t('graph.fitView')}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="justify-center gap-1.5"
					aria-pressed={spinning}
					onclick={() => (spinning = !spinning)}
				>
					{#if spinning}
						<Pause size={13} /> {t('graph.pauseSpin')}
					{:else}
						<Play size={13} /> {t('graph.resumeSpin')}
					{/if}
				</Button>
			</div>

			<Button
				variant="ghost"
				size="sm"
				class="mt-2 w-full justify-start gap-2.5 rounded-lg px-1.5 py-1 text-label-md {guides
					? ''
					: 'opacity-40'}"
				aria-pressed={guides}
				onclick={() => (guides = !guides)}
			>
				<span
					class="h-[3px] w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15"
					style="background: {legendColor(GRAPH_TOKENS.label)}"
				></span>
				<span class="flex-1 text-left">{t('graph.guides')}</span>
			</Button>
		</div>

		<GraphDrawer
			node={selected}
			nodes={graph.nodes}
			edges={graph.edges}
			onclose={() => (selected = null)}
			onselect={(node) => selectNode(node)}
			onopen={onopen}
		/>
	{/if}
</section>