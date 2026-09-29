import * as THREE from 'three';
import type { GraphNode } from '$lib/content/workspace-graph';

/**
 * Deterministic 3D layout for the graph scene.
 *
 * Every folder owns one tilted orbital ring, so clusters stay visually
 * separated instead of collapsing into a single blob. Positions come from
 * closed-form orbit math (no simulation to tick), which keeps the scene stable
 * across rebuilds: the same workspace always lands in the same place.
 *
 * Kept free of DOM access so it stays unit-testable; `graph-engine` owns the
 * Three.js scene itself.
 */

export type OrbitRing = {
	a: number;
	b: number;
	tilt: number;
	yaw: number;
	roll: number;
	lift: number;
	phase: number;
};

export type GraphLayout = {
	/** One position per input node, index-aligned. */
	positions: THREE.Vector3[];
	/** One ring per distinct folder, index-aligned with `rings`. */
	rings: OrbitRing[];
	/** Distinct folders in first-seen order. */
	folders: string[];
	/** Position of a folder's ring within `rings`. */
	folderRing: Map<string, number>;
	/** Guide polylines, one per ring, for the faint orbital traces. */
	guides: THREE.Vector3[][];
};

/**
 * Eight spread-out rings: enough shapes that folders rarely overlap, still
 * deterministic. Radii are deliberately close to each other — the rings are
 * overlapped rather than nested, so nodes from different folders are near enough
 * for links between them to read as connections instead of long strays.
 *
 * Ported from the reference orbital graph ({ a: 43, b: 28 } … { a: 27, b: 21 }),
 * scaled to the workspace graph's node budget. The wider spread and the varied
 * eccentricity are what make the traces read as distinct orbits rather than a
 * stack of near-circles.
 */
export const ORBIT_RINGS: OrbitRing[] = [
	{ a: 43, b: 28, tilt: -0.2, yaw: -0.25, roll: 0.1, lift: 1.8, phase: 0.08 },
	{ a: 38, b: 31, tilt: 0.27, yaw: 0.56, roll: -0.13, lift: -1.3, phase: 0.65 },
	{ a: 33, b: 25, tilt: -0.42, yaw: 1.05, roll: 0.16, lift: 0.4, phase: 0.18 },
	{ a: 27, b: 21, tilt: 0.48, yaw: -0.62, roll: -0.12, lift: 0, phase: 0.83 },
	{ a: 41, b: 23, tilt: 0.14, yaw: 0.1, roll: -0.34, lift: 2.4, phase: 0.31 },
	{ a: 30, b: 34, tilt: -0.55, yaw: 0.28, roll: 0.22, lift: -2.1, phase: 0.52 },
	{ a: 36, b: 27, tilt: 0.36, yaw: -1.12, roll: 0.07, lift: 1.1, phase: 0.74 },
	{ a: 24, b: 30, tilt: -0.1, yaw: 0.9, roll: -0.28, lift: -0.6, phase: 0.95 },
];

/**
 * How many rings exist. Callers can pre-compute this so the scene knows its
 * maximum extent before the first layout pass.
 */
export function ringCount(folderCount: number): number {
	return Math.max(1, Math.min(folderCount, ORBIT_RINGS.length));
}

function ringFor(index: number): OrbitRing {
	return ORBIT_RINGS[index % ORBIT_RINGS.length];
}

function ringRotation(ring: OrbitRing): THREE.Quaternion {
	return new THREE.Quaternion().setFromEuler(new THREE.Euler(ring.tilt, ring.yaw, ring.roll, 'YXZ'));
}

/** Point on a ring at `angle` radians, in scene space. */
export function ringPoint(ring: OrbitRing, angle: number): THREE.Vector3 {
	const point = new THREE.Vector3(ring.a * Math.cos(angle), 0, ring.b * Math.sin(angle));
	point.applyQuaternion(ringRotation(ring));
	point.y += ring.lift;
	return point;
}

/** Folders in first-seen order, so ring assignment never depends on sort order. */
export function distinctFolders(nodes: readonly GraphNode[]): string[] {
	const seen = new Set<string>();
	const folders: string[] = [];
	for (const node of nodes) {
		if (seen.has(node.folder)) continue;
		seen.add(node.folder);
		folders.push(node.folder);
	}
	return folders;
}

/**
 * Fraction of a ring one node occupies at most. The reference spaces 25 peers
 * around a full turn; a workspace folder rarely holds that many, so the ramp is
 * capped below `1` to keep a lone folder's nodes off each other's exact angle.
 */
const NODES_PER_TURN = 25;

export function buildGraphLayout(nodes: readonly GraphNode[]): GraphLayout {
	const folders = distinctFolders(nodes);
	const folderRing = new Map<string, number>();
	folders.forEach((folder, index) => folderRing.set(folder, index));

	const counts = new Map<string, number>();
	for (const node of nodes) counts.set(node.folder, (counts.get(node.folder) ?? 0) + 1);

	const cursors = new Map<string, number>();
	const positions: THREE.Vector3[] = [];

	for (const node of nodes) {
		const ringIndex = folderRing.get(node.folder) ?? 0;
		const ring = ringFor(ringIndex);
		const total = Math.max(1, counts.get(node.folder) ?? 1);
		const index = cursors.get(node.folder) ?? 0;
		cursors.set(node.folder, index + 1);

		// Spread the folder around the whole ring, as the reference does, so a
		// folder reads as an orbit rather than an arc. The fraction is capped so a
		// folder with only a handful of notes still uses most of the turn instead
		// of bunching into a few degrees.
		const fraction = Math.min(NODES_PER_TURN, Math.max(total, 2));
		const angle = (index / fraction) * Math.PI * 2 + ring.phase;
		const position = ringPoint(ring, angle);

		// A small, repeatable radial deviation keeps nodes on the ring band rather
		// than on the mathematical line, matching the reference's orbit rather than
		// scatter. Doing it radially (not as a flat x/z offset) is what preserves
		// the ellipse: the node slides along its own radius.
		const radial = 1 + 0.025 * Math.sin(index * 2.39 + ringIndex);
		position.multiplyScalar(radial);

		// Vertical wobble, so same-folder nodes are not all coplanar.
		position.y += 0.45 * Math.sin(angle * 3 + ringIndex);

		positions.push(position);
	}

	const rings = Array.from({ length: ringCount(folders.length) }, (_, index) => ringFor(index));
	const guides = rings.map((ring) => {
		const points: THREE.Vector3[] = [];
		for (let step = 0; step <= 192; step += 1) points.push(ringPoint(ring, (step / 192) * Math.PI * 2));
		return points;
	});

	return { positions, rings, folders, folderRing, guides };
}
