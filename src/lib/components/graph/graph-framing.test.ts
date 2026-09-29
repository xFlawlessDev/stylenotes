import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { centerOffset, centroid, clampFraming, SIDE_INSET } from './graph-framing';

const viewport = { width: 1200, height: 800, fov: 42 };

/** Camera looking down -Z from `(0, 0, 100)`, so its world +X is screen right. */
function camera(): THREE.PerspectiveCamera {
	const cam = new THREE.PerspectiveCamera(viewport.fov, viewport.width / viewport.height, 0.1, 2000);
	cam.position.set(0, 0, 100);
	cam.lookAt(0, 0, 0);
	cam.updateMatrixWorld();
	return cam;
}

describe('graph-framing', () => {
	it('offsets the camera sideways for the overlay insets, never vertically', () => {
		const offset = centerOffset(camera(), new THREE.Vector3(), viewport);
		expect(offset.x).toBeGreaterThan(0);
		expect(offset.y).toBeCloseTo(0, 5);
	});

	it('scales the centring offset with distance', () => {
		const cam = camera();
		const near = centerOffset(cam, new THREE.Vector3(), viewport).length();

		cam.position.set(0, 0, 400);
		cam.updateMatrixWorld();
		const far = centerOffset(cam, new THREE.Vector3(), viewport).length();

		expect(far).toBeGreaterThan(near);
	});

	it('honours a custom inset, including zero', () => {
		const offset = centerOffset(camera(), new THREE.Vector3(), viewport, 0);
		expect(offset.length()).toBeCloseTo(0, 6);
	});

	it('stays finite when looking straight down', () => {
		const cam = new THREE.PerspectiveCamera(42, 1.5, 0.1, 2000);
		cam.position.set(0, 100, 0);
		cam.up.set(0, 0, 1);
		cam.lookAt(0, 0, 0);
		cam.updateMatrixWorld();
		expect(Number.isFinite(centerOffset(cam, new THREE.Vector3(), viewport).x)).toBe(true);
	});

	it('uses a modest side inset by default', () => {
		expect(SIDE_INSET).toBeGreaterThan(0);
		expect(SIDE_INSET).toBeLessThan(0.5);
	});

	it('centres a polyline on the midpoint of its points', () => {
		const mid = centroid([new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 4, -2)]);
		expect(mid.toArray()).toEqual([5, 2, -1]);
	});

	it('handles an empty point list without dividing by zero', () => {
		expect(centroid([]).toArray()).toEqual([0, 0, 0]);
	});

	it('clamps a framing fraction into the usable range', () => {
		expect(clampFraming(0.01)).toBe(0.35);
		expect(clampFraming(9)).toBe(1.6);
		expect(clampFraming(0.8)).toBe(0.8);
	});
});
