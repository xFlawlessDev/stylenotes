import * as THREE from 'three';
import type { GraphEdge, GraphEdgeKind, GraphNode } from '$lib/content/workspace-graph';
import { refreshGraphPalette } from '$lib/components/graph/graph-palette';
import { activeNodeId, buildAdjacency, nodeSize, type GraphFocus } from '$lib/components/graph/graph-appearance';
import { createGraphAppearance } from '$lib/components/graph/graph-appearance-transition';
import { buildGraphScene, retintGraphScene, sceneExtent, type GraphScene } from '$lib/components/graph/graph-scene';
import { createCameraRig, framingDistance, HOME_DIRECTION } from '$lib/components/graph/graph-camera';
import { attachGraphInput, type GraphInput } from '$lib/components/graph/graph-input';
import { centerOffset, centroid, clampFraming } from '$lib/components/graph/graph-framing';

/**
 * Three.js 3D graph: nodes sit on per-folder orbital rings, links are one batched
 * ribbon buffer, and hover/selection drives a per-node brightness transition the
 * render loop eases toward.
 *
 * The scene is rebuilt only when the graph *shape* changes; highlight, edge-kind
 * visibility, selection and theme mutate the existing buffers, so interacting
 * with the graph never stutters on a rebuild. Camera behaviour lives in
 * `graph-camera`, input in `graph-input`, buffer transitions in
 * `graph-appearance-transition`.
 */

export type GraphEngine = {
	update(nodes: GraphNode[], edges: GraphEdge[]): void;
	setHighlight(ids: Set<string> | null): void;
	setVisibleKinds(kinds: Record<GraphEdgeKind, boolean>): void;
	/** Persistent focus driven by the details drawer. */
	setSelected(id: string | null): void;
	/** Fly the camera to a node and pin it (used by search results). */
	focusNode(id: string): void;
	/** Fly the camera to frame an edge's full span. */
	focusEdge(id: string): void;
	/** Slow idle rotation, off for `prefers-reduced-motion`. */
	setAutoRotate(enabled: boolean): void;
	/** Re-tint nodes, links and guides after a light/dark or accent change. */
	refreshTheme(): void;
	/** Show or hide the decorative orbital rings. */
	setGuidesVisible(visible: boolean): void;
	fit(): void;
	destroy(): void;
};

export type GraphEngineOptions = {
	host: HTMLElement;
	/**
	 * Node click: opens the details drawer (null when the background is clicked).
	 * When `onclickFrames` is set the engine also flies the camera to the node, so
	 * the click both selects and focuses.
	 */
	onselect: (node: GraphNode | null) => void;
	/**
	 * Double-clicking a node opens it. Optional: without it a double-click just
	 * behaves like two selections.
	 */
	onopen?: (node: GraphNode) => void;
	/**
	 * Reports the hovered node (null when the pointer leaves), for the status pill
	 * and the hover card. `screen` is the node's client-space position.
	 */
	onfocus?: (node: GraphNode | null, screen: { x: number; y: number } | null) => void;
};

export async function createGraphEngine({ host, onselect, onopen, onfocus }: GraphEngineOptions): Promise<GraphEngine> {
	let nodes: GraphNode[] = [];
	let links: GraphEdge[] = [];
	let scene: GraphScene | null = null;

	const focus: GraphFocus = { hoveredId: null, selectedId: null, highlight: null };
	let visibleKinds: Record<GraphEdgeKind, boolean> = { wiki: true, dependency: true, link: true };
	let adjacency = buildAdjacency([], []);
	let appearance = createGraphAppearance(adjacency);
	let appearanceDirty = true;

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = THREE.SRGBColorSpace;

	const canvas = renderer.domElement;
	canvas.style.display = 'block';
	canvas.style.touchAction = 'none';
	canvas.style.cursor = 'grab';
	canvas.tabIndex = 0;
	host.appendChild(canvas);

	const motionPreference =
		typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-reduced-motion: reduce)')
			: null;
	let reducedMotion = motionPreference?.matches ?? false;

	const rig = createCameraRig({
		canvas,
		reducedMotion,
		// Fires from OrbitControls, so `rig` is assigned before a user can interact.
		onInteract: () => {
			rig.cancel();
			setHovered(null);
		},
	});
	const { camera, controls } = rig;
	rig.setAutoRotate(!reducedMotion);

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const projected = new THREE.Vector3();
	const viewPosition = new THREE.Vector3();
	const hits: THREE.Intersection[] = [];

	let input: GraphInput | null = null;
	let frame = 0;
	let disposed = false;
	let firstResize = true;
	let contextLost = false;

	// ── Appearance ───────────────────────────────────────────────────────────

	/** Recompute targets from the current focus; the render loop eases toward them. */
	function retarget(): void {
		if (!scene) return;
		appearance.retarget(scene, nodes, links, focus, visibleKinds);
		// Focused ribbons thicken slightly, so a highlighted path reads at a glance.
		scene.edgeMaterial.uniforms.uScale.value = activeNodeId(focus) ? 1.35 : 1;
		appearanceDirty = true;
	}

	// ── Picking ──────────────────────────────────────────────────────────────

	function pick(x: number, y: number): string | null {
		const current = scene;
		if (!current) return null;

		const rect = canvas.getBoundingClientRect();
		const px = x - rect.left;
		const py = y - rect.top;
		if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;

		camera.updateMatrixWorld();
		current.nodes.updateMatrixWorld();
		pointer.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);

		// A conservative world-space threshold, then a screen-space reject: a point
		// can be near in world space yet far from the cursor on screen.
		const farthestDepth = camera.position.length() + sceneExtent(current.layout) * 1.2;
		raycaster.params.Points.threshold =
			((2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * farthestDepth) / rect.height) * 16;
		raycaster.setFromCamera(pointer, camera);

		hits.length = 0;
		raycaster.intersectObject(current.nodes, false, hits);

		let closest: string | null = null;
		let best = Infinity;

		for (const hit of hits) {
			if (hit.index === undefined) continue;
			const position = current.layout.positions[hit.index];
			if (!position) continue;

			projected.copy(position).project(camera);
			if (projected.z < -1 || projected.z > 1) continue;

			const sx = (projected.x * 0.5 + 0.5) * rect.width;
			const sy = (-projected.y * 0.5 + 0.5) * rect.height;
			viewPosition.copy(position).applyMatrix4(camera.matrixWorldInverse);

			const attenuation = THREE.MathUtils.clamp(110 / Math.max(1, -viewPosition.z), 0.72, 1.65);
			const radius = THREE.MathUtils.clamp(current.sizes[hit.index] * attenuation * 0.42, 8, 18);
			const distance = (sx - px) ** 2 + (sy - py) ** 2;

			if (distance <= radius * radius && distance < best) {
				best = distance;
				closest = current.ids[hit.index] ?? null;
			}
		}

		return closest;
	}

	function nodeById(id: string | null): GraphNode | null {
		return id ? (nodes.find((node) => node.id === id) ?? null) : null;
	}

	/**
	 * Screen position of a node in client coordinates, for anchoring overlays like
	 * the hover card. Null when the node is behind the camera.
	 */
	function projectToScreen(id: string): { x: number; y: number } | null {
		const current = scene;
		const index = current ? current.ids.indexOf(id) : -1;
		if (!current || index < 0) return null;

		const rect = canvas.getBoundingClientRect();
		projected.copy(current.layout.positions[index]).project(camera);
		if (projected.z < -1 || projected.z > 1) return null;

		return {
			x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
			y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
		};
	}

	function setHovered(id: string | null): void {
		if (focus.hoveredId !== id) {
			focus.hoveredId = id;
			retarget();
			onfocus?.(nodeById(id), id ? projectToScreen(id) : null);
		}
		input?.setCursor(input.pointerCount > 0 ? 'grabbing' : id === null ? 'grab' : 'pointer');
	}

	// ── Sizing ───────────────────────────────────────────────────────────────

	function resize(): void {
		const width = Math.max(1, host.clientWidth);
		const height = Math.max(1, host.clientHeight);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		renderer.setPixelRatio(dpr);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		const distance = framingDistance((scene ? sceneExtent(scene.layout) : 40) * 1.05, camera.fov, camera.aspect);
		rig.homePosition.copy(HOME_DIRECTION).multiplyScalar(distance);
		controls.maxDistance = Math.max(160, distance * 1.8);

		if (scene) {
			scene.nodeMaterial.uniforms.uDpr.value = dpr;
			scene.coreMaterial.uniforms.uDpr.value = dpr;
			// Ribbon thickness is authored in CSS pixels, so the shader needs the
			// CSS-pixel viewport, not the device-pixel drawing buffer.
			(scene.edgeMaterial.uniforms.uResolution.value as THREE.Vector2).set(width, height);
			scene.edgeMaterial.uniforms.uScale.value = 1;
			scene.edgeMaterial.uniforms.uHalfFovTan.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
		}

		// Only the very first resize positions the camera. Later ones must not: a
		// rebuild would otherwise yank the view back to the "fit everything" pose
		// right after a search flight had aimed it at a node.
		if (firstResize) {
			camera.position.copy(rig.homePosition);
			controls.target.set(0, 0, 0);
			controls.update(0);
			firstResize = false;
		} else if (focus.selectedId === null && !input?.pointerCount && !rig.flight) {
			// Keep the orientation, but refit the orbital envelope.
			const direction = camera.position.clone().sub(controls.target).normalize();
			if (direction.lengthSq() === 0) direction.copy(HOME_DIRECTION);
			camera.position.copy(controls.target).addScaledVector(direction, distance);
			controls.update(0);
		}
	}

	// ── Rebuild ──────────────────────────────────────────────────────────────

	function build(nextNodes: GraphNode[], nextLinks: GraphEdge[]): void {
		const isFirstBuild = scene === null;
		scene?.dispose();
		nodes = nextNodes;
		links = nextLinks;
		adjacency = buildAdjacency(nodes, links);
		appearance = createGraphAppearance(adjacency);

		scene = buildGraphScene(nodes, links);

		if (focus.selectedId && !nodes.some((node) => node.id === focus.selectedId)) {
			focus.selectedId = null;
			onselect(null);
		}
		if (focus.hoveredId && !nodes.some((node) => node.id === focus.hoveredId)) focus.hoveredId = null;

		retarget();
		// Snap to the settled values so a rebuild never animates in from nothing.
		appearance.settle(scene, nodes, links);
		appearanceDirty = false;

		// Only the initial build positions the camera; a later rebuild (a new note,
		// a renamed title) must leave the user's viewpoint alone.
		if (isFirstBuild) firstResize = true;
		resize();
	}

	// ── Camera framing ───────────────────────────────────────────────────────

	/** Viewport description the framing helpers need. */
	function viewport(): { width: number; height: number; fov: number } {
		return { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight), fov: camera.fov };
	}

	/**
	 * Fly to `anchor` at a distance derived from the graph's own extent.
	 *
	 * A fraction of the extent rather than an absolute distance: point sprites
	 * keep a fixed pixel size, so their apparent size never changes with distance,
	 * and framing is really about how much of the layout stays in view. A fixed
	 * distance would be too close on a small graph and too far on a large one.
	 */
	function frameSubject(anchor: THREE.Vector3, fraction: number): void {
		const current = scene;
		if (!current) return;

		const direction = camera.position.clone().sub(controls.target).normalize();
		if (direction.lengthSq() === 0) direction.copy(HOME_DIRECTION);

		const extent = Math.max(40, sceneExtent(current.layout));
		const distance = THREE.MathUtils.clamp(extent * clampFraming(fraction), 50, camera.far * 0.5);
		const position = anchor.clone().addScaledVector(direction, distance);

		// Compute the offset against the *destination* camera, so it is correct for
		// the final framing rather than the one we are leaving.
		const view = viewport();
		const probe = camera.clone();
		probe.position.copy(position);
		probe.lookAt(anchor);
		probe.updateMatrixWorld();
		position.add(centerOffset(probe, anchor, view));

		rig.flyTo(anchor, position);
	}

	function focusNode(id: string): void {
		const current = scene;
		const index = current ? current.ids.indexOf(id) : -1;
		if (!current || index < 0) return;

		// Close enough that the node dominates, wide enough that its neighbours —
		// the links the user is inspecting — stay on screen.
		frameSubject(current.layout.positions[index], 0.6);
		setHovered(null);
	}

	/**
	 * Frame an edge's full span, centred between its endpoints and pulled back far
	 * enough that the whole link, plus the nodes it joins, is in view.
	 */
	function focusEdge(edgeId: string): void {
		const current = scene;
		if (!current) return;
		const index = links.findIndex((edge) => edge.id === edgeId);
		const curve = index >= 0 ? current.edgeCurves[index] : undefined;
		if (!curve || curve.length === 0) return;

		const from = curve[0];
		const to = curve[curve.length - 1];
		const span = from.distanceTo(to);
		const extent = Math.max(40, sceneExtent(current.layout));
		// Never closer than the node framing; back off as the edge gets longer.
		frameSubject(centroid([from, to]), Math.max(0.6, (span * 1.6) / extent));
		setHovered(null);
	}

	// ── Render loop ──────────────────────────────────────────────────────────

	let lastTime = performance.now();

	function animate(now: number): void {
		if (disposed) return;
		frame = requestAnimationFrame(animate);

		const current = scene;
		const delta = Math.min((now - lastTime) / 1000, 0.05);
		lastTime = now;
		if (!current || document.hidden || contextLost) return;

		const cameraChanged = rig.step(delta, now);

		if (appearanceDirty) appearanceDirty = appearance.step(current, nodes, links, delta, reducedMotion);

		if (input?.canHover() && !rig.flight && (input.pointerDirty || cameraChanged)) {
			setHovered(pick(input.x, input.y));
			input.markHovered();
		}

		renderer.render(current.scene, camera);
	}

	// ── Wiring ───────────────────────────────────────────────────────────────

	input = attachGraphInput({
		canvas,
		rig,
		handlers: {
			onclick(x, y) {
				const node = nodeById(pick(x, y));
				const wasSelected = node !== null && node.id === focus.selectedId;

				// Pin the selection here rather than waiting for the drawer's effect,
				// so the "second click opens" check below is against current state.
				focus.selectedId = node?.id ?? null;
				onselect(node);
				retarget();

				// Clicking a node focuses it exactly like picking from the search
				// list: the drawer opens *and* the camera moves in. Clicking empty
				// space clears the selection and leaves the viewpoint alone.
				if (!node) return;

				focusNode(node.id);

				// A second click on the already-pinned node opens it. Comparing
				// against the selection rather than timing keeps this independent of
				// click speed.
				if (onopen && wasSelected) onopen(node);
			},
			onhover(x, y) {
				if (rig.flight) return;
				setHovered(pick(x, y));
			},
			onclear() {
				setHovered(null);
			},
			oncontext(lost) {
				contextLost = lost;
				if (!lost) input?.markHovered();
			},
		},
	});

	function onMotionChange(event: MediaQueryListEvent): void {
		reducedMotion = event.matches;
		rig.duration = reducedMotion ? 0 : 1100;
		if (!reducedMotion) return;
		rig.cancel();
		if (rig.flight) rig.flight.duration = 0;
	}

	motionPreference?.addEventListener('change', onMotionChange);

	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);

	frame = requestAnimationFrame(animate);

	return {
		update: build,
		setHighlight(ids) {
			focus.highlight = ids;
			retarget();
		},
		setVisibleKinds(kinds) {
			visibleKinds = kinds;
			retarget();
		},
		setSelected(id) {
			focus.selectedId = id;
			retarget();
		},
		focusNode,
		focusEdge,
		setAutoRotate(enabled) {
			rig.setAutoRotate(enabled);
		},
		refreshTheme() {
			// The palette caches against the DOM theme key, so it must be dropped
			// before any token is resolved again.
			refreshGraphPalette();
			if (scene) retintGraphScene(scene, nodes, links);
		},
		setGuidesVisible(visible) {
			if (scene) scene.guides.visible = visible;
		},
		fit() {
			rig.fit();
		},
		destroy() {
			disposed = true;
			cancelAnimationFrame(frame);
			resizeObserver.disconnect();
			input?.destroy();
			scene?.dispose();
			scene = null;
			rig.dispose();
			renderer.dispose();
			motionPreference?.removeEventListener('change', onMotionChange);
			canvas.remove();
		},
	};
}
