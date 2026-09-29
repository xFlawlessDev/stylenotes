import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Camera rig for the 3D graph: orbit controls plus interruptible flight
 * animations.
 *
 * Flights matter because search and "fit view" both need to move the camera
 * without fighting the user's own drag: starting a flight flushes inertia, and
 * any manual interaction cancels it. `graph-engine` owns the render loop; this
 * owns *where the camera is*.
 */

/**
 * Padding around a framed layout. `fit` must leave the graph comfortably inside
 * the viewport: framing the bounding sphere exactly reads as "zoomed out too
 * far", because perspective puts the silhouette edges closer to the camera than
 * the centre.
 */
export const FIT_PADDING = 1.12;

export type CameraFlight = {
	start: number;
	duration: number;
	fromPosition: THREE.Vector3;
	toPosition: THREE.Vector3;
	fromTarget: THREE.Vector3;
	toTarget: THREE.Vector3;
};

export type CameraRig = {
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	/** Where the camera sits when the layout is framed. */
	homePosition: THREE.Vector3;
	/** Seconds of travel; 0 when the user prefers reduced motion. */
	duration: number;
	flight: CameraFlight | null;
	/** True while a flight or damping moved the camera this frame. */
	step(delta: number, now: number): boolean;
	flyTo(target: THREE.Vector3, position: THREE.Vector3): void;
	/** Frame the layout from the current direction. */
	fit(): void;
	/** Return to the default orientation. */
	reset(): void;
	zoom(factor: number): void;
	/** Cancel any flight (the user grabbed the camera). */
	cancel(): void;
	setAutoRotate(enabled: boolean): void;
	dispose(): void;
};

export const HOME_DIRECTION = new THREE.Vector3(0, 0.44, 1).normalize();

/**
 * Camera distance that fits a sphere of `radius` in view.
 *
 * Both axes are considered: a tall window is constrained vertically, a wide one
 * horizontally, and `fit` should never clip on the tighter axis.
 */
export function framingDistance(radius: number, fov: number, aspect: number, padding = FIT_PADDING): number {
	const halfFov = Math.tan(THREE.MathUtils.degToRad(fov / 2));
	const fit = Math.max(radius / halfFov, radius / (halfFov * aspect));
	return Math.max(60, fit * padding);
}

export function createCameraRig(options: {
	canvas: HTMLCanvasElement;
	reducedMotion: boolean;
	onInteract: () => void;
}): CameraRig {
	const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1400);
	const controls = new OrbitControls(camera, options.canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.065;
	controls.enablePan = false;
	controls.rotateSpeed = 0.38;
	controls.zoomSpeed = 0.65;
	controls.minDistance = 30;
	controls.minPolarAngle = 0.2;
	controls.maxPolarAngle = Math.PI - 0.2;
	controls.autoRotateSpeed = 0.12;

	const rig: CameraRig = {
		camera,
		controls,
		homePosition: new THREE.Vector3(),
		duration: options.reducedMotion ? 0 : 1100,
		flight: null,

		step(delta, now) {
			let changed = false;
			const flight = rig.flight;
			if (flight) {
				const progress = flight.duration === 0 ? 1 : Math.min((now - flight.start) / flight.duration, 1);
				const eased = progress * progress * (3 - 2 * progress);
				camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
				controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
				changed = true;
				if (progress === 1) rig.flight = null;
			}
			return controls.update(delta) || changed;
		},

		flyTo(target, position) {
			controls.autoRotate = false;
			// Flush residual damping so it cannot fight the interpolation.
			controls.enableDamping = false;
			controls.update(0);
			controls.enableDamping = true;

			rig.flight = {
				start: performance.now(),
				duration: rig.duration,
				fromPosition: camera.position.clone(),
				toPosition: position.clone(),
				fromTarget: controls.target.clone(),
				toTarget: target.clone(),
			};
		},

		fit() {
			const direction = camera.position.clone().sub(controls.target).normalize();
			if (direction.lengthSq() === 0) direction.copy(HOME_DIRECTION);
			rig.flyTo(new THREE.Vector3(), direction.multiplyScalar(rig.homePosition.length()));
		},

		reset() {
			rig.flyTo(new THREE.Vector3(), rig.homePosition.clone());
		},

		zoom(factor) {
			const offset = camera.position.clone().sub(controls.target);
			const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
			rig.flyTo(controls.target, controls.target.clone().add(offset.setLength(distance)));
		},

		cancel() {
			rig.flight = null;
			controls.autoRotate = false;
		},

		setAutoRotate(enabled) {
			controls.autoRotate = enabled;
		},

		dispose() {
			controls.dispose();
		},
	};

	controls.addEventListener('start', options.onInteract);
	return rig;
}
