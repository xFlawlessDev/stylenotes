import * as THREE from 'three';
import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import {
	GRAPH_TOKENS,
	graphEdgeColor,
	graphNodeColor,
	graphTokenColor,
} from '$lib/components/graph/graph-palette';
import { buildGraphLayout, type GraphLayout } from '$lib/components/graph/graph-layout';
import { NO_FOCUS, nodeSize } from '$lib/components/graph/graph-appearance';
import {
	CORE_FRAGMENT_SHADER,
	CORE_VERTEX_SHADER,
	EDGE_FRAGMENT_SHADER,
	EDGE_VERTEX_SHADER,
	NODE_FRAGMENT_SHADER,
	NODE_VERTEX_SHADER,
} from '$lib/components/graph/graph-shaders';

/**
 * Owns every Three.js object for one workspace graph, and nothing else.
 *
 * `graph-engine` drives this; the scene exposes typed buffers so the engine can
 * mutate sizes/strengths/opacities per frame without reaching into Three.js
 * internals. `dispose` releases geometry, materials and textures — Three.js
 * never frees those on its own, and a graph rebuild must not leak them.
 */

export type GraphScene = {
	scene: THREE.Scene;
	nodes: THREE.Points;
	edges: THREE.Mesh;
	/** Decorative origin glow; never picked, never counted. */
	core: THREE.Points;
	guides: THREE.LineSegments;
	/** Live positions; the render loop writes into this array in place. */
	positions: Float32Array;
	/** Per-node dynamic attributes the appearance transition animates. */
	sizes: Float32Array;
	strengths: Float32Array;
	sizeAttribute: THREE.BufferAttribute;
	strengthAttribute: THREE.BufferAttribute;
	edgeOpacity: Float32Array;
	edgeOpacityAttribute: THREE.BufferAttribute;
	/** Every node id in buffer order, so an index maps back to a node. */
	ids: string[];
	/** Edge index → kind, for visibility filtering. */
	edgeKinds: GraphEdge['kind'][];
	/** Edge index → its two endpoints, for framing and hover hit-tests. */
	edgeCurves: THREE.Vector3[][];
	layout: GraphLayout;
	nodeMaterial: THREE.ShaderMaterial;
	coreMaterial: THREE.ShaderMaterial;
	edgeMaterial: THREE.ShaderMaterial;
	guideMaterial: THREE.LineDashedMaterial;
	starMaterial: THREE.PointsMaterial;
	dispose(): void;
};

/** Quad vertices per link: source-left, source-right, target-left, target-right. */
export const VERTICES_PER_LINK = 4;

/** Per-kind line thickness in CSS pixels. Dependencies read as the boldest. */
export function edgeWidth(kind: GraphEdgeKind): number {
	if (kind === 'dependency') return 2.4;
	if (kind === 'link') return 2.1;
	// The suggestion kinds read as lighter traces than the edges the user made.
	if (kind === 'related' || kind === 'semantic' || kind === 'contradicts') return 1.3;
	return 1.7;
}

/**
 * Orbital guide tint: a faint blend of the label colour toward the surface, so
 * the traces read as texture in both light and dark mode instead of hard
 * near-black or near-white lines.
 */
function guideTint(): THREE.Color {
	const label = new THREE.Color(graphTokenColor(GRAPH_TOKENS.label));
	const surface = new THREE.Color(graphTokenColor(GRAPH_TOKENS.background));
	return label.lerp(surface, 0.55);
}

function buildGuideGeometry(layout: GraphLayout): THREE.BufferGeometry {
	const positions: number[] = [];
	const colors: number[] = [];
	const tint = guideTint();

	for (const guide of layout.guides) {
		for (let index = 0; index < guide.length - 1; index += 1) {
			guide[index].toArray(positions, positions.length);
			guide[index + 1].toArray(positions, positions.length);
			tint.toArray(colors, colors.length);
			tint.toArray(colors, colors.length);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	return geometry;
}

function starPositions(count = 140): Float32Array {
	// Same generator as the reference, so star placement is identical each build.
	let seed = 1729;
	const random = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};

	const positions = new Float32Array(count * 3);
	for (let index = 0; index < count; index += 1) {
		const theta = random() * Math.PI * 2;
		const y = random() * 2 - 1;
		const radius = 320 + random() * 120;
		const side = Math.sqrt(Math.max(0, 1 - y * y));
		positions.set(
			[radius * side * Math.cos(theta), radius * y, radius * side * Math.sin(theta)],
			index * 3,
		);
	}
	return positions;
}

export function buildGraphScene(nodes: GraphNode[], links: GraphEdge[]): GraphScene {
	const layout = buildGraphLayout(nodes);
	const count = nodes.length;

	const positions = new Float32Array(count * 3);
	const colors = new Float32Array(count * 3);
	const ids = new Float32Array(count);
	const sizes = new Float32Array(count);
	const strengths = new Float32Array(count).fill(1);
	const palette = new THREE.Color();

	nodes.forEach((node, index) => {
		layout.positions[index].toArray(positions, index * 3);
		palette.setHex(graphNodeColor(node)).toArray(colors, index * 3);
		ids[index] = index;
		// `NO_FOCUS`: this is the resting radius; the transition module owns the
		// hover/selection bump.
		sizes[index] = nodeSize(node, NO_FOCUS);
	});

	const nodeGeometry = new THREE.BufferGeometry();
	nodeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	nodeGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
	nodeGeometry.setAttribute('aId', new THREE.BufferAttribute(ids, 1));
	const sizeAttribute = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
	const strengthAttribute = new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage);
	nodeGeometry.setAttribute('aSize', sizeAttribute);
	nodeGeometry.setAttribute('aStrength', strengthAttribute);
	nodeGeometry.computeBoundingSphere();

	const nodeMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		// Normal blending, not additive: the node body has to *occlude* the links
		// that meet its centre, which additive can never do.
		blending: THREE.NormalBlending,
		uniforms: { uDpr: { value: 1 }, uSelected: { value: -10 } },
		vertexShader: NODE_VERTEX_SHADER,
		fragmentShader: NODE_FRAGMENT_SHADER,
	});

	const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
	nodePoints.renderOrder = 3;

	// Every relationship is one straight quad in a single draw call. A straight
	// segment cannot drift away from the nodes it joins, which a bowed curve can
	// as the camera moves. The geometry is built once; only `aOpacity` animates.
	const edgePositions = new Float32Array(links.length * VERTICES_PER_LINK * 3);
	/** The far endpoint, so the shader can derive the segment's screen direction. */
	const edgeOthers = new Float32Array(links.length * VERTICES_PER_LINK * 3);
	const edgeColors = new Float32Array(links.length * VERTICES_PER_LINK * 3);
	const edgeOpacity = new Float32Array(links.length * VERTICES_PER_LINK);
	const edgeSides = new Float32Array(links.length * VERTICES_PER_LINK);
	const edgeWidths = new Float32Array(links.length * VERTICES_PER_LINK);
	const edgeIndices: number[] = [];
	/** The two endpoints per link, for framing and hover hit-tests. */
	const edgeCurves: THREE.Vector3[][] = [];
	const indexOf = new Map(nodes.map((node, index) => [node.id, index]));

	links.forEach((edge, link) => {
		const source = indexOf.get(edge.source);
		const target = indexOf.get(edge.target);
		const start = link * VERTICES_PER_LINK;

		if (source === undefined || target === undefined) {
			// Leave the quad collapsed at the origin and skip its indices, so an
			// unresolvable link renders nothing instead of a stray mark at (0,0,0).
			edgeCurves.push([]);
			return;
		}

		const from = layout.positions[source];
		const to = layout.positions[target];
		edgeCurves.push([from, to]);

		// One colour for the whole span, taken from the legend's Links swatch for
		// this kind. Blending the two endpoint *nodes'* colours here made every
		// link read as a note-to-task tint and left the legend promising colours
		// the canvas never drew: a dependency was blue→teal, never its pink.
		const edgeColor = new THREE.Color(graphEdgeColor(edge.kind));
		const width = edgeWidth(edge.kind);

		const points = [from, from, to, to];
		const others = [to, to, from, from];
		const colors = [edgeColor, edgeColor, edgeColor, edgeColor];
		const sides = [-1, 1, -1, 1];

		for (let vertex = 0; vertex < VERTICES_PER_LINK; vertex += 1) {
			const slot = start + vertex;
			points[vertex].toArray(edgePositions, slot * 3);
			others[vertex].toArray(edgeOthers, slot * 3);
			colors[vertex].toArray(edgeColors, slot * 3);
			edgeSides[slot] = sides[vertex];
			edgeWidths[slot] = width;
		}

		edgeIndices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
	});

	const edgeGeometry = new THREE.BufferGeometry();
	edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
	edgeGeometry.setAttribute('aOther', new THREE.BufferAttribute(edgeOthers, 3));
	edgeGeometry.setAttribute('aColor', new THREE.BufferAttribute(edgeColors, 3));
	edgeGeometry.setAttribute('aSide', new THREE.BufferAttribute(edgeSides, 1));
	edgeGeometry.setAttribute('aWidth', new THREE.BufferAttribute(edgeWidths, 1));
	const edgeOpacityAttribute = new THREE.BufferAttribute(edgeOpacity, 1).setUsage(THREE.DynamicDrawUsage);
	edgeGeometry.setAttribute('aOpacity', edgeOpacityAttribute);
	edgeGeometry.setIndex(edgeIndices);

	const edgeMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.NormalBlending,
		uniforms: {
			uResolution: { value: new THREE.Vector2(1, 1) },
			uScale: { value: 1 },
			uHalfFovTan: { value: Math.tan(THREE.MathUtils.degToRad(21)) },
		},
		vertexShader: EDGE_VERTEX_SHADER,
		fragmentShader: EDGE_FRAGMENT_SHADER,
	});

	const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
	edgeMesh.frustumCulled = false;
	edgeMesh.renderOrder = 1;

	const guideGeometry = buildGuideGeometry(layout);
	// `LineDashedMaterial`, not `LineBasicMaterial`: dashing is what keeps these
	// rings from being mistaken for relationships.
	const guideMaterial = new THREE.LineDashedMaterial({
		vertexColors: true,
		transparent: true,
		// Deliberately barely-there. These rings are scene dressing, not data: if
		// they read like links they look like connections that join nothing.
		opacity: 0.14,
		depthWrite: false,
		dashSize: 2,
		gapSize: 3,
	});
	const guideLines = new THREE.LineSegments(guideGeometry, guideMaterial);
	guideLines.renderOrder = 0;
	// Dash spacing is measured from the geometry's own line distances.
	guideLines.computeLineDistances();

	const coreGeometry = new THREE.BufferGeometry();
	coreGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
	const coreMaterial = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		uniforms: { uDpr: { value: 1 }, uColor: { value: new THREE.Color(0xb0d1ff) } },
		vertexShader: CORE_VERTEX_SHADER,
		fragmentShader: CORE_FRAGMENT_SHADER,
	});
	const corePoints = new THREE.Points(coreGeometry, coreMaterial);

	const starGeometry = new THREE.BufferGeometry();
	starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions(), 3));
	const starMaterial = new THREE.PointsMaterial({
		color: new THREE.Color(0x8190ac),
		size: 0.8,
		sizeAttenuation: false,
		transparent: true,
		opacity: 0.22,
		depthWrite: false,
	});
	const stars = new THREE.Points(starGeometry, starMaterial);

	const scene = new THREE.Scene();
	scene.add(edgeMesh, guideLines, nodePoints, corePoints, stars);

	return {
		scene,
		nodes: nodePoints,
		edges: edgeMesh,
		core: corePoints,
		guides: guideLines,
		positions,
		sizes,
		strengths,
		sizeAttribute,
		strengthAttribute,
		edgeOpacity,
		edgeOpacityAttribute,
		ids: nodes.map((node) => node.id),
		edgeKinds: links.map((edge) => edge.kind),
		edgeCurves,
		layout,
		nodeMaterial,
		coreMaterial,
		edgeMaterial,
		guideMaterial,
		starMaterial,
		dispose() {
			// Geometry first, then materials: each owns GPU buffers.
			for (const geometry of [nodeGeometry, edgeGeometry, guideGeometry, coreGeometry, starGeometry]) {
				geometry.dispose();
			}
			for (const material of [nodeMaterial, edgeMaterial, guideMaterial, coreMaterial, starMaterial]) {
				material.dispose();
			}
			scene.clear();
		},
	};
}

/**
 * Re-tint a live scene in place after a theme change, or when a theme cluster is
 * selected in the legend.
 *
 * `themeColors` maps `note:<id>` / `task:<id>` to a packed RGB. When it is set,
 * a node in the map takes that colour and every node outside it is desaturated
 * toward the surface, so the chosen theme reads as the subject and the rest as
 * context — without moving anything. Links carry their kind's legend colour and
 * are only faded the same way, never recoloured: the Links swatch is a promise.
 */
export function retintGraphScene(
	scene: GraphScene,
	nodes: GraphNode[],
	links: GraphEdge[],
	themeColors: Map<string, number> | null = null,
): void {
	const surface = new THREE.Color(graphTokenColor(GRAPH_TOKENS.background));
	const colorFor = (node: GraphNode): THREE.Color => {
		if (!themeColors) return new THREE.Color(graphNodeColor(node));
		const override = themeColors.get(node.id);
		if (override !== undefined) return new THREE.Color(override);
		// Outside the selected theme: fade toward the background so the cluster
		// stands out without turning the rest into a black hole.
		return new THREE.Color(graphNodeColor(node)).lerp(surface, 0.72);
	};

	const nodeColors = scene.nodes.geometry.getAttribute('aColor') as THREE.BufferAttribute;
	nodes.forEach((node, index) => {
		colorFor(node).toArray(nodeColors.array as Float32Array, index * 3);
	});
	nodeColors.needsUpdate = true;

	// Links keep their kind's legend colour; a selected theme only fades the ones
	// that fall outside the cluster, mirroring how its member nodes are recoloured.
	const edgeColors = scene.edges.geometry.getAttribute('aColor') as THREE.BufferAttribute;
	const array = edgeColors.array as Float32Array;
	links.forEach((edge, link) => {
		const color = new THREE.Color(graphEdgeColor(edge.kind));
		const outside = themeColors !== null && !themeColors.has(edge.source) && !themeColors.has(edge.target);
		if (outside) color.lerp(surface, 0.72);

		const base = link * VERTICES_PER_LINK;
		for (let vertex = 0; vertex < VERTICES_PER_LINK; vertex += 1) {
			color.toArray(array, (base + vertex) * 3);
		}
	});
	edgeColors.needsUpdate = true;

	const guideColors = scene.guides.geometry.getAttribute('color') as THREE.BufferAttribute;
	const guideArray = guideColors.array as Float32Array;
	const tint = guideTint();
	for (let index = 0; index < guideArray.length; index += 3) tint.toArray(guideArray, index);
	guideColors.needsUpdate = true;

	scene.coreMaterial.uniforms.uColor.value = new THREE.Color(graphTokenColor(GRAPH_TOKENS.note));
}

/** Radius of the scene's orbited layout, for camera framing. */
export function sceneExtent(layout: GraphLayout): number {
	let extent = 0;
	for (const guide of layout.guides) {
		for (const point of guide) extent = Math.max(extent, point.length());
	}
	return extent || 40;
}
