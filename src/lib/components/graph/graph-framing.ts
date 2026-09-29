import * as THREE from 'three';

/**
 * Pure 3D geometry helpers for the graph camera.
 *
 * A focused node or edge must land in the *middle* of the viewport, not just in
 * front of the camera. The overlays occupy the left column and the right drawer,
 * so the visible centre is offset from the geometric one; these helpers compute
 * the difference.
 *
 * No DOM and no Three.js renderer, so all of it is unit-testable.
 */

/** Fraction of the viewport width kept clear for the dock rail and the drawer. */
export const SIDE_INSET = 0.12;

export type Viewport = {
	width: number;
	height: number;
	fov: number;
};

/**
 * World-space offset added to a camera position so `target` projects to the
 * viewport's clear centre rather than its geometric one.
 *
 * `viewOffset` is the idiomatic Three.js tool for this, but it changes where
 * every ray is cast from, which would desync `Raycaster` picking from the
 * rendered image. Moving the camera instead keeps picking pixel-exact.
 */
export function centerOffset(camera: THREE.PerspectiveCamera, target: THREE.Vector3, viewport: Viewport, inset = SIDE_INSET): THREE.Vector3 {
	// Right vector in world space: the camera's local +X, flattened to the
	// horizontal plane so a raised camera does not skew the shift vertically.
	const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
	right.y = 0;
	if (right.lengthSq() === 0) return new THREE.Vector3();
	right.normalize();

	const distance = camera.position.distanceTo(target);
	const halfFov = Math.tan(THREE.MathUtils.degToRad(viewport.fov / 2));
	// World units per screen edge at the target's depth.
	const worldHeight = 2 * distance * halfFov;
	const worldWidth = worldHeight * (viewport.width / viewport.height);

	// Shifting the camera opposite the inset moves the subject toward it.
	return right.multiplyScalar(worldWidth * inset);
}

/** Midpoint of a set of points, used as the orbit target for an edge. */
export function centroid(points: readonly THREE.Vector3[]): THREE.Vector3 {
	const center = new THREE.Vector3();
	for (const point of points) center.add(point);
	return points.length ? center.divideScalar(points.length) : center;
}

/**
 * Fraction of a subject's own extent to stand back by when framing it.
 *
 * Clamped so a tiny subject is still approached closely and a large one does not
 * push the camera outside the scene.
 */
export function clampFraming(fraction: number, min = 0.35, max = 1.6): number {
	return Math.max(min, Math.min(max, fraction));
}
