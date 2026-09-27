import type { Container, FederatedPointerEvent, Graphics, Sprite, Text } from 'pixi.js';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import { GRAPH_TOKENS, graphEdgeColor, graphNodeColor, graphTokenColor } from '$lib/components/graph/graph-palette';

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { id: string; kind: GraphEdgeKind };

type NodeView = {
	container: Container;
	halo: Sprite;
	circle: Sprite;
	label: Text;
	fontSize: number;
	node: SimNode;
};

export type GraphEngine = {
	update(nodes: GraphNode[], edges: GraphEdge[]): void;
	setHighlight(ids: Set<string> | null): void;
	setVisibleKinds(kinds: Record<GraphEdgeKind, boolean>): void;
	/** Persistent focus driven by the details drawer. */
	setSelected(id: string | null): void;
	/** Re-tint nodes, links and labels after a light/dark or accent change. */
	refreshTheme(): void;
	fit(): void;
	destroy(): void;
};

export type GraphEngineOptions = {
	host: HTMLElement;
	/** Node click: opens the details drawer (null when the background is clicked). */
	onselect: (node: GraphNode | null) => void;
	/** Reports the hovered node (null when the pointer leaves), for the status pill. */
	onfocus?: (node: GraphNode | null) => void;
};

function edgeStyle(kind: GraphEdgeKind): { width: number; alpha: number; color: number } {
	const color = graphEdgeColor(kind);
	if (kind === 'wiki') return { width: 0.8, alpha: 0.34, color };
	if (kind === 'link') return { width: 0.9, alpha: 0.42, color };
	return { width: 0.9, alpha: 0.38, color };
}

function seededRandom(seed = 42) {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

/**
 * Force-directed Pixi canvas themed by the workspace: node, link and label
 * colours resolve from CSS custom properties (see `graph-palette`), links are
 * drawn as one redrawable Graphics, and hover focus isolates a node's
 * connections. `refreshTheme` re-tints the scene after a light/dark swap.
 */
export async function createGraphEngine({ host, onselect, onfocus }: GraphEngineOptions): Promise<GraphEngine> {
	const PIXI = await import('pixi.js');
	const { Viewport } = await import('pixi-viewport');
	const d3 = await import('d3-force');

	const width = Math.max(host.clientWidth, 480);
	const height = Math.max(host.clientHeight, 320);
	const worldWidth = width * 1.7;
	const worldHeight = height * 1.7;

	const app = new PIXI.Application();
	await app.init({
		width,
		height,
		backgroundAlpha: 0,
		antialias: true,
		autoDensity: true,
		resolution: Math.min(window.devicePixelRatio || 1, 2),
	});
	app.canvas.style.display = 'block';
	app.canvas.style.touchAction = 'none';
	host.appendChild(app.canvas);

	const viewport = new Viewport({
		screenWidth: width,
		screenHeight: height,
		worldWidth,
		worldHeight,
		events: app.renderer.events,
		passiveWheel: false,
	});
	viewport.drag().pinch().wheel({ smooth: 4 }).decelerate().clampZoom({ minScale: 0.35, maxScale: 4 });
	app.stage.addChild(viewport);

	const linksLayer = new PIXI.Graphics();
	const nodesLayer = new PIXI.Container();
	const labelsLayer = new PIXI.Container();
	viewport.addChild(linksLayer, nodesLayer, labelsLayer);

	const baseCircle = new PIXI.Graphics();
	baseCircle.circle(0, 0, 24).fill(0xffffff);
	const circleTexture = app.renderer.generateTexture({ target: baseCircle, resolution: 2, antialias: true });
	baseCircle.destroy();

	let simulation: Simulation<SimNode, SimLink> | null = null;
	let simNodes: SimNode[] = [];
	let simLinks: SimLink[] = [];
	let highlight: Set<string> | null = null;
	let visibleKinds: Record<GraphEdgeKind, boolean> = { wiki: true, dependency: true, link: true };
	let hoverId: string | null = null;
	let selectedId: string | null = null;
	let dragging = false;
	let fitted = false;
	let dragPointerId: number | null = null;
	let dragView: NodeView | null = null;
	let dragActive = false;
	let dragMoved = false;
	let dragOrigin = { x: 0, y: 0 };

	const nodeViews = new Map<string, NodeView>();

	function nodeRadius(node: GraphNode): number {
		return Math.min(18, 7 + Math.sqrt(node.degree) * 3.2);
	}

	/** Label style follows the workspace theme so text stays legible in both modes. */
	function labelStyle(fontSize: number, degree: number) {
		return {
			fontFamily: 'Inter, Arial, sans-serif',
			fontSize,
			fill: graphTokenColor(GRAPH_TOKENS.label),
			stroke: { color: graphTokenColor(GRAPH_TOKENS.labelStroke), width: degree >= 4 ? 5 : 4 },
			fontWeight: (degree >= 4 ? '600' : '400') as '600' | '400',
		};
	}

	function refreshTheme() {
		for (const view of nodeViews.values()) {
			view.halo.tint = graphNodeColor(view.node);
			view.circle.tint = graphNodeColor(view.node);
			view.label.style = labelStyle(view.fontSize, view.node.degree);
		}
		drawLinks();
	}

	function linkNode(endpoint: string | number | SimNode): SimNode | undefined {
		return typeof endpoint === 'object' ? endpoint : simNodes.find((node) => node.id === String(endpoint));
	}

	function linkEnds(link: SimLink): { source: SimNode; target: SimNode } | null {
		const source = linkNode(link.source);
		const target = linkNode(link.target);
		return source && target ? { source, target } : null;
	}

	function connectedTo(id: string): Set<string> {
		const ids = new Set<string>([id]);
		for (const link of simLinks) {
			const ends = linkEnds(link);
			if (!ends) continue;
			if (ends.source.id === id) ids.add(ends.target.id);
			if (ends.target.id === id) ids.add(ends.source.id);
		}
		return ids;
	}

	function focus(): string | null {
		return hoverId ?? selectedId;
	}

	function drawLinks() {
		linksLayer.clear();
		for (const kind of ['wiki', 'link', 'dependency'] as GraphEdgeKind[]) {
			if (!visibleKinds[kind]) continue;
			const style = edgeStyle(kind);
			let drew = false;
			for (const link of simLinks) {
				if (link.kind !== kind) continue;
				const ends = linkEnds(link);
				if (!ends) continue;
				linksLayer.moveTo(ends.source.x ?? 0, ends.source.y ?? 0);
				linksLayer.lineTo(ends.target.x ?? 0, ends.target.y ?? 0);
				drew = true;
			}
			if (drew) linksLayer.stroke({ width: style.width, color: style.color, alpha: style.alpha });
		}

		// Focus pass: the focused node's connections glow in its own colour.
		const focusNodeId = focus();
		const focusView = focusNodeId ? nodeViews.get(focusNodeId) : undefined;
		const activeIds = focusNodeId ? connectedTo(focusNodeId) : highlight;
		if (!activeIds || activeIds.size === 0) return;
		const color = focusView ? graphNodeColor(focusView.node) : graphTokenColor(GRAPH_TOKENS.label);
		let drew = false;
		for (const link of simLinks) {
			if (!visibleKinds[link.kind]) continue;
			const ends = linkEnds(link);
			if (!ends) continue;
			if (!activeIds.has(ends.source.id) && !activeIds.has(ends.target.id)) continue;
			linksLayer.moveTo(ends.source.x ?? 0, ends.source.y ?? 0);
			linksLayer.lineTo(ends.target.x ?? 0, ends.target.y ?? 0);
			drew = true;
		}
		if (drew) linksLayer.stroke({ width: 1.8, color, alpha: focusNodeId ? 0.72 : 0.5 });
	}

	function applyDimming() {
		const focusNodeId = focus();
		const activeIds = focusNodeId ? connectedTo(focusNodeId) : highlight;
		for (const [id, view] of nodeViews) {
			const active = !activeIds || activeIds.has(id);
			view.container.alpha = active ? 1 : 0.2;
			view.label.alpha = active ? 1 : 0.18;
			view.halo.alpha = id === focusNodeId ? 0.22 : 0.07;
			view.container.scale.set(id === focusNodeId ? 1.22 : 1);
		}
	}

	function refreshFocus() {
		drawLinks();
		applyDimming();
	}

	function setSelected(id: string | null) {
		selectedId = id;
		refreshFocus();
	}

	function nodeAt(world: { x: number; y: number }): NodeView | null {
		let found: NodeView | null = null;
		let best = Infinity;
		for (const view of nodeViews.values()) {
			const distance = Math.hypot((view.node.x ?? 0) - world.x, (view.node.y ?? 0) - world.y);
			if (distance > nodeRadius(view.node) + 6 || distance >= best) continue;
			best = distance;
			found = view;
		}
		return found;
	}

	function pointerToWorld(event: PointerEvent) {
		const rect = app.canvas.getBoundingClientRect();
		return viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
	}

	/** Press-and-hold a node to move it; the rest of the layout re-settles. */
	function beginNodeDrag(view: NodeView, event: FederatedPointerEvent) {
		if (event.button !== 0 || dragPointerId !== null) return;
		event.stopPropagation();
		dragPointerId = event.pointerId;
		dragView = view;
		dragActive = false;
		dragMoved = false;
		dragOrigin = { x: event.clientX, y: event.clientY };
		// Keep the viewport from panning while the node is held.
		viewport.plugins.pause('drag');
		window.addEventListener('pointermove', onNodePointerMove);
		window.addEventListener('pointerup', onNodePointerUp);
		window.addEventListener('pointercancel', onNodePointerUp);
	}

	function onNodePointerMove(event: PointerEvent) {
		const view = dragView;
		if (event.pointerId !== dragPointerId || !view) return;
		if (!dragActive) {
			const moved = Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y);
			if (moved < 4) return;
			dragActive = true;
			dragMoved = true;
			view.container.cursor = 'grabbing';
			app.canvas.style.cursor = 'grabbing';
			simulation?.alphaTarget(0.18).restart();
		}
		const point = pointerToWorld(event);
		view.node.fx = point.x;
		view.node.fy = point.y;
		// Follow the pointer exactly so the node never slips out from under it.
		view.node.x = point.x;
		view.node.y = point.y;
		view.container.position.set(point.x, point.y);
		view.label.position.set(point.x + nodeRadius(view.node) + 5, point.y - view.fontSize * 0.45);
	}

	function endNodeDrag() {
		const view = dragView;
		window.removeEventListener('pointermove', onNodePointerMove);
		window.removeEventListener('pointerup', onNodePointerUp);
		window.removeEventListener('pointercancel', onNodePointerUp);
		dragPointerId = null;
		dragView = null;
		viewport.plugins.resume('drag');
		app.canvas.style.cursor = '';
		if (view) {
			view.node.fx = null;
			view.node.fy = null;
			view.container.cursor = 'pointer';
		}
		if (dragActive) simulation?.alphaTarget(0);
		dragActive = false;
	}

	function onNodePointerUp(event: PointerEvent) {
		if (event.pointerId !== dragPointerId) return;
		endNodeDrag();
	}

	function syncPositions() {
		for (const view of nodeViews.values()) {
			const radius = nodeRadius(view.node);
			view.container.position.set(view.node.x ?? 0, view.node.y ?? 0);
			view.label.position.set((view.node.x ?? 0) + radius + 5, (view.node.y ?? 0) - view.fontSize * 0.45);
		}
	}

	function fit() {
		if (!simNodes.length) return;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const node of simNodes) {
			const x = node.x ?? 0;
			const y = node.y ?? 0;
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		}
		const viewWidth = Math.max(1, host.clientWidth);
		const viewHeight = Math.max(1, host.clientHeight);
		const spanX = Math.max(220, maxX - minX + 260);
		const spanY = Math.max(220, maxY - minY + 260);
		const scale = Math.min(1.6, Math.max(0.35, Math.min(viewWidth / spanX, viewHeight / spanY)));
		viewport.setZoom(scale, true);
		viewport.moveCenter((minX + maxX) / 2, (minY + maxY) / 2);
	}

	function build(nodes: GraphNode[], edges: GraphEdge[]) {
		if (dragPointerId !== null) endNodeDrag();
		simulation?.stop();
		for (const layer of [nodesLayer, labelsLayer]) {
			for (const child of layer.removeChildren()) child.destroy({ children: true });
		}
		nodeViews.clear();
		hoverId = null;
		if (selectedId && !nodes.some((node) => node.id === selectedId)) {
			selectedId = null;
			onselect(null);
		}

		simNodes = nodes.map((node) => ({ ...node }));
		simLinks = edges.map((edge) => ({
			id: edge.id,
			kind: edge.kind,
			source: edge.source,
			target: edge.target,
		}));

		// One anchor per folder spreads the graph into clusters, like the
		// reference demo's per-group anchors.
		const anchors = new Map<string, { x: number; y: number }>();
		const folderKeys = [...new Set(simNodes.map((node) => node.folder))];
		folderKeys.forEach((folder, index) => {
			const angle = (index / Math.max(1, folderKeys.length)) * Math.PI * 2 - Math.PI / 2;
			anchors.set(folder, {
				x: worldWidth * 0.5 + Math.cos(angle) * worldWidth * 0.24,
				y: worldHeight * 0.5 + Math.sin(angle) * worldHeight * 0.24,
			});
		});
		const rand = seededRandom(42);
		for (const node of simNodes) {
			const anchor = anchors.get(node.folder) ?? { x: worldWidth * 0.5, y: worldHeight * 0.5 };
			node.x = anchor.x + (rand() - 0.5) * worldWidth * 0.12;
			node.y = anchor.y + (rand() - 0.5) * worldHeight * 0.12;
		}

		for (const node of simNodes) {
			const radius = nodeRadius(node);
			const container = new PIXI.Container();
			container.position.set(node.x ?? 0, node.y ?? 0);
			container.eventMode = 'static';
			container.cursor = 'pointer';
			container.hitArea = new PIXI.Circle(0, 0, Math.max(radius + 7, 12));

			const halo = new PIXI.Sprite(circleTexture);
			halo.anchor.set(0.5);
			halo.tint = graphNodeColor(node);
			halo.alpha = 0.07;
			halo.width = radius * 3.3;
			halo.height = radius * 3.3;

			const circle = new PIXI.Sprite(circleTexture);
			circle.anchor.set(0.5);
			circle.tint = graphNodeColor(node);
			circle.alpha = 0.95;
			circle.width = radius * 2;
			circle.height = radius * 2;

			container.addChild(halo, circle);

			const fontSize = node.degree >= 4 ? 14 : node.degree >= 1 ? 12 : 11;
			const label = new PIXI.Text({
				text: node.title,
				style: labelStyle(fontSize, node.degree),
			});
			label.resolution = 2;
			label.position.set((node.x ?? 0) + radius + 5, (node.y ?? 0) - fontSize * 0.45);
			labelsLayer.addChild(label);

			const view: NodeView = { container, halo, circle, label, fontSize, node };
			nodeViews.set(node.id, view);

			container.on('pointerover', () => {
				hoverId = node.id;
				refreshFocus();
				onfocus?.(node);
			});
			container.on('pointerout', () => {
				hoverId = null;
				refreshFocus();
				onfocus?.(null);
			});
			container.on('pointerdown', (event) => beginNodeDrag(view, event));
			container.on('pointertap', () => {
				if (dragging || dragMoved) return;
				selectedId = node.id;
				refreshFocus();
				onselect(node);
			});
			nodesLayer.addChild(container);
		}

		simulation = d3
			.forceSimulation<SimNode>(simNodes)
			.force(
				'link',
				d3
					.forceLink<SimNode, SimLink>(simLinks)
					.id((node) => node.id)
					.distance((link) => (link.kind === 'dependency' ? 120 : link.kind === 'link' ? 80 : 95))
					.strength(0.55),
			)
			.force('charge', d3.forceManyBody<SimNode>().strength((node) => (node.degree >= 4 ? -380 : -140)))
			.force('collide', d3.forceCollide<SimNode>().radius((node) => nodeRadius(node) + 6).iterations(2))
			.force('x', d3.forceX<SimNode>((node) => anchors.get(node.folder)?.x ?? worldWidth / 2).strength(0.08))
			.force('y', d3.forceY<SimNode>((node) => anchors.get(node.folder)?.y ?? worldHeight / 2).strength(0.08))
			.force('center', d3.forceCenter(worldWidth / 2, worldHeight / 2));
		simulation.stop();
		simulation.tick(340);
		// Live ticks only happen while a node is being dragged (reheat below).
		simulation.on('tick', () => {
			syncPositions();
			drawLinks();
		});

		syncPositions();
		drawLinks();
		applyDimming();
		if (!fitted && simNodes.length) {
			fitted = true;
			fit();
		}
	}

	const resizeObserver = new ResizeObserver(() => {
		const nextWidth = Math.max(1, host.clientWidth);
		const nextHeight = Math.max(1, host.clientHeight);
		app.renderer.resize(nextWidth, nextHeight);
		viewport.resize(nextWidth, nextHeight, worldWidth, worldHeight);
	});
	resizeObserver.observe(host);

	viewport.on('drag-start', () => {
		dragging = true;
	});
	viewport.on('drag-end', () => {
		dragging = false;
	});
	viewport.on('clicked', (event) => {
		// Clicks that land on a node are handled by the node's own tap handler.
		if (nodeAt(event.world)) return;
		if (selectedId === null) return;
		selectedId = null;
		refreshFocus();
		onselect(null);
	});

	return {
		update: build,
		setHighlight(next) {
			highlight = next;
			drawLinks();
			applyDimming();
		},
		setVisibleKinds(next) {
			visibleKinds = next;
			drawLinks();
		},
		setSelected,
		refreshTheme,
		fit,
		destroy() {
			simulation?.stop();
			simulation = null;
			resizeObserver.disconnect();
			window.removeEventListener('pointermove', onNodePointerMove);
			window.removeEventListener('pointerup', onNodePointerUp);
			window.removeEventListener('pointercancel', onNodePointerUp);
			app.destroy(true, { children: true, texture: true });
		},
	};
}
