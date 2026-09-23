import type { Container, Sprite, Text } from 'pixi.js';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import { readGraphTheme, type GraphTheme } from '$lib/components/graph/graph-theme';

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { id: string; kind: GraphEdgeKind };

type EdgeGfx = { container: Container; line: Sprite; arrow: Sprite; link: SimLink; width: number };

export type GraphEngine = {
	update(nodes: GraphNode[], edges: GraphEdge[]): void;
	setHighlight(ids: Set<string> | null): void;
	setVisibleKinds(kinds: Record<GraphEdgeKind, boolean>): void;
	setTheme(): void;
	fit(): void;
	destroy(): void;
};

export type GraphEngineOptions = {
	host: HTMLElement;
	onopen: (node: GraphNode) => void;
};

const EDGE_STYLE: Record<GraphEdgeKind, { width: number; alpha: number }> = {
	wiki: { width: 1.4, alpha: 0.8 },
	dependency: { width: 1.2, alpha: 0.65 },
	link: { width: 1, alpha: 0.55 },
};

/** Force-directed Pixi canvas: d3-force owns the layout, Pixi the drawing. */
export async function createGraphEngine({ host, onopen }: GraphEngineOptions): Promise<GraphEngine> {
	const PIXI = await import('pixi.js');
	const { Viewport } = await import('pixi-viewport');
	const d3 = await import('d3-force');

	const bounds = host.getBoundingClientRect();
	const app = new PIXI.Application();
	await app.init({
		width: Math.max(1, bounds.width),
		height: Math.max(1, bounds.height),
		backgroundAlpha: 0,
		antialias: true,
		autoDensity: true,
		resolution: Math.min(window.devicePixelRatio || 1, 2),
	});
	app.canvas.style.display = 'block';
	app.canvas.style.touchAction = 'none';
	host.appendChild(app.canvas);

	const viewport = new Viewport({
		screenWidth: app.screen.width,
		screenHeight: app.screen.height,
		worldWidth: app.screen.width,
		worldHeight: app.screen.height,
		events: app.renderer.events,
		passiveWheel: false,
	});
	app.stage.addChild(viewport);
	viewport.drag().pinch().wheel().decelerate({ friction: 0.93 }).clampZoom({ minScale: 0.15, maxScale: 3 });
	viewport.moveCenter(0, 0);

	const linkLayer = new PIXI.Container();
	const nodeLayer = new PIXI.Container();
	const labelLayer = new PIXI.Container();
	viewport.addChild(linkLayer, nodeLayer, labelLayer);

	const shapes = new PIXI.Graphics();
	shapes.circle(0, 0, 16).fill(0xffffff);
	const circleTexture = app.renderer.generateTexture({ target: shapes, resolution: 2, antialias: true });
	shapes.clear();
	shapes.roundRect(-16, -16, 32, 32, 9).fill(0xffffff);
	const squareTexture = app.renderer.generateTexture({ target: shapes, resolution: 2, antialias: true });
	shapes.clear();
	shapes.moveTo(-6, -5).lineTo(6, 0).lineTo(-6, 5).closePath().fill(0xffffff);
	const arrowTexture = app.renderer.generateTexture({ target: shapes, resolution: 2, antialias: true });
	shapes.destroy();

	let theme: GraphTheme = readGraphTheme(host);
	let simulation: Simulation<SimNode, SimLink> | null = null;
	let simNodes: SimNode[] = [];
	let simLinks: SimLink[] = [];
	let highlight: Set<string> | null = null;
	let visibleKinds: Record<GraphEdgeKind, boolean> = { wiki: true, dependency: true, link: true };
	let dragging = false;
	let fitted = false;

	const nodeGfx = new Map<string, Container>();
	const nodeLabels = new Map<string, Text>();
	const nodeData = new Map<string, SimNode>();
	const edgeGfx = new Map<string, EdgeGfx>();

	function nodeRadius(node: GraphNode): number {
		return Math.min(17, 7 + Math.sqrt(node.degree) * 3);
	}

	function nodeColor(node: GraphNode): number {
		return node.kind === 'note' ? theme.note : theme.task[node.status ?? 'todo'];
	}

	function linkEndpointId(endpoint: string | number | SimNode): string {
		return typeof endpoint === 'string' || typeof endpoint === 'number' ? String(endpoint) : endpoint.id;
	}

	function linkNode(endpoint: string | number | SimNode): SimNode | undefined {
		return typeof endpoint === 'object' ? endpoint : simNodes.find((node) => node.id === String(endpoint));
	}

	function clearLayer(layer: Container) {
		for (const child of layer.removeChildren()) child.destroy({ children: true });
	}

	function createLabel(text: string): Text {
		const label = new PIXI.Text({
			text,
			style: {
				fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
				fontSize: 12,
				fill: theme.label,
				stroke: { color: theme.labelStroke, width: 3 },
			},
		});
		label.resolution = 2;
		label.anchor.set(0, 0.5);
		return label;
	}

	function applyHighlight() {
		for (const [id, container] of nodeGfx) {
			container.alpha = highlight && !highlight.has(id) ? 0.18 : 1;
			const label = nodeLabels.get(id);
			if (label) label.alpha = highlight && !highlight.has(id) ? 0.12 : 1;
		}
		for (const entry of edgeGfx.values()) {
			const source = linkEndpointId(entry.link.source);
			const target = linkEndpointId(entry.link.target);
			entry.container.visible =
				visibleKinds[entry.link.kind] &&
				(!highlight || highlight.has(source) || highlight.has(target));
		}
	}

	function updatePositions() {
		for (const node of simNodes) {
			const x = node.x ?? 0;
			const y = node.y ?? 0;
			nodeGfx.get(node.id)?.position.set(x, y);
			const label = nodeLabels.get(node.id);
			if (label) label.position.set(x + nodeRadius(node) + 5, y);
		}
		for (const entry of edgeGfx.values()) {
			const source = linkNode(entry.link.source);
			const target = linkNode(entry.link.target);
			if (!source || !target) continue;
			const dx = (target.x ?? 0) - (source.x ?? 0);
			const dy = (target.y ?? 0) - (source.y ?? 0);
			const distance = Math.hypot(dx, dy);
			entry.container.position.set(source.x ?? 0, source.y ?? 0);
			entry.container.rotation = Math.atan2(dy, dx);
			const length = Math.max(distance - nodeRadius(target), 0);
			entry.line.width = length;
			entry.arrow.x = Math.max(0, length - 6);
		}
		applyHighlight();
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
		const width = Math.max(1, host.clientWidth);
		const height = Math.max(1, host.clientHeight);
		const spanX = Math.max(140, maxX - minX + 200);
		const spanY = Math.max(140, maxY - minY + 200);
		const scale = Math.min(2, Math.max(0.15, Math.min(width / spanX, height / spanY)));
		viewport.setZoom(scale, true);
		viewport.moveCenter((minX + maxX) / 2, (minY + maxY) / 2);
	}

	function build(nodes: GraphNode[], edges: GraphEdge[]) {
		simulation?.stop();
		clearLayer(linkLayer);
		clearLayer(nodeLayer);
		clearLayer(labelLayer);
		nodeGfx.clear();
		nodeLabels.clear();
		nodeData.clear();
		edgeGfx.clear();

		simNodes = nodes.map((node) => ({ ...node }));
		simLinks = edges.map((edge) => ({
			id: edge.id,
			kind: edge.kind,
			source: edge.source,
			target: edge.target,
		}));

		// Seed positions on a circle so the pre-run below has no origin pile-up.
		const spread = Math.max(70, Math.sqrt(simNodes.length) * 70);
		simNodes.forEach((node, index) => {
			const angle = (index / Math.max(1, simNodes.length)) * Math.PI * 2;
			node.x = Math.cos(angle) * spread * 0.5;
			node.y = Math.sin(angle) * spread * 0.5;
		});

		for (const node of simNodes) {
			const radius = nodeRadius(node);
			const container = new PIXI.Container();
			container.eventMode = 'static';
			container.cursor = 'pointer';
			container.hitArea = new PIXI.Circle(0, 0, radius + 5);
			const sprite = new PIXI.Sprite(node.kind === 'note' ? circleTexture : squareTexture);
			sprite.anchor.set(0.5);
			sprite.width = radius * 2;
			sprite.height = radius * 2;
			sprite.tint = nodeColor(node);
			container.addChild(sprite);
			container.on('pointerover', () => container.scale.set(1.15));
			container.on('pointerout', () => container.scale.set(1));
			container.on('pointertap', () => {
				if (!dragging) onopen(node);
			});
			nodeLayer.addChild(container);
			nodeGfx.set(node.id, container);
			nodeData.set(node.id, node);

			const label = createLabel(node.title);
			labelLayer.addChild(label);
			nodeLabels.set(node.id, label);
		}

		for (const link of simLinks) {
			const style = EDGE_STYLE[link.kind];
			const container = new PIXI.Container();
			container.pivot.set(0, style.width / 2);
			const line = new PIXI.Sprite(PIXI.Texture.WHITE);
			line.y = -style.width / 2;
			line.height = style.width;
			line.alpha = style.alpha;
			line.tint = theme.edges[link.kind];
			const arrow = new PIXI.Sprite(arrowTexture);
			arrow.anchor.set(0.5);
			arrow.width = 7;
			arrow.height = 7;
			arrow.alpha = style.alpha;
			arrow.tint = theme.edges[link.kind];
			container.addChild(line, arrow);
			linkLayer.addChild(container);
			edgeGfx.set(link.id, { container, line, arrow, link, width: style.width });
		}

		simulation = d3
			.forceSimulation<SimNode>(simNodes)
			.force(
				'link',
				d3
					.forceLink<SimNode, SimLink>(simLinks)
					.id((node) => node.id)
					.distance((link) => (link.kind === 'dependency' ? 115 : 95))
					.strength(0.5),
			)
			.force('charge', d3.forceManyBody<SimNode>().strength(-240).distanceMax(700))
			.force('center', d3.forceCenter(0, 0))
			.force('collide', d3.forceCollide<SimNode>().radius((node) => nodeRadius(node) + 12).strength(0.9));
		simulation.stop();
		simulation.tick(240);
		updatePositions();
		if (!fitted && simNodes.length) {
			fitted = true;
			fit();
		}
	}

	function setTheme() {
		theme = readGraphTheme(host);
		for (const [id, container] of nodeGfx) {
			const node = nodeData.get(id);
			const sprite = container.children[0];
			if (node && sprite instanceof PIXI.Sprite) sprite.tint = nodeColor(node);
		}
		for (const label of nodeLabels.values()) {
			label.style.fill = theme.label;
			label.style.stroke = { color: theme.labelStroke, width: 3 };
		}
		for (const entry of edgeGfx.values()) {
			entry.line.tint = theme.edges[entry.link.kind];
			entry.arrow.tint = theme.edges[entry.link.kind];
		}
	}

	const resizeObserver = new ResizeObserver(() => {
		const width = Math.max(1, host.clientWidth);
		const height = Math.max(1, host.clientHeight);
		app.renderer.resize(width, height);
		viewport.resize(width, height);
	});
	resizeObserver.observe(host);

	viewport.on('drag-start', () => {
		dragging = true;
	});
	viewport.on('drag-end', () => {
		dragging = false;
	});

	return {
		update: build,
		setHighlight(next) {
			highlight = next;
			applyHighlight();
		},
		setVisibleKinds(next) {
			visibleKinds = next;
			applyHighlight();
		},
		setTheme,
		fit,
		destroy() {
			simulation?.stop();
			simulation = null;
			resizeObserver.disconnect();
			app.destroy(true, { children: true, texture: true });
		},
	};
}
