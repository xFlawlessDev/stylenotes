import * as THREE from 'three';
import type { CameraRig } from '$lib/components/graph/graph-camera';

/**
 * Pointer and keyboard input for the 3D graph.
 *
 * Owns the gesture state machine — press/drag/click disambiguation, multi-touch
 * tracking, hover and keyboard camera nudges — and reports outcomes through
 * callbacks. `graph-engine` stays responsible for scene state and rendering.
 *
 * The distinction that matters: a press that never moves is a click (select a
 * node), a press that moves is a drag (orbit the camera). Both start with the
 * same pointerdown, so the decision can only be made on pointerup.
 */

/** Pixels of travel before a press counts as a drag instead of a click. */
const DRAG_THRESHOLD = 5;

/** Radians per arrow-key press. */
const KEY_YAW_STEP = 0.08;
const KEY_PITCH_STEP = 0.06;

export type GraphInputHandlers = {
	/** A completed click. `x`/`y` are client coordinates for hit-testing. */
	onclick: (x: number, y: number) => void;
	/** The pointer moved with no button down; drives hover highlighting. */
	onhover: (x: number, y: number) => void;
	/** The pointer left the canvas, or a drag began and hover must clear. */
	onclear: () => void;
	/** The WebGL context was lost or restored; frames cannot be drawn while lost. */
	oncontext?: (lost: boolean) => void;
};

export type GraphInput = {
	/** Remaining fingers/buttons down. Above one means a pinch or a drag. */
	readonly pointerCount: number;
	/** Last known client position. */
	readonly x: number;
	readonly y: number;
	/** True when the pointer moved since the last hover test. */
	pointerDirty: boolean;
	/** True when the pointer is on the canvas and no button is down. */
	canHover(): boolean;
	/** Clear the pending hover test (the render loop consumed it). */
	markHovered(): void;
	/** True while a camera flight may safely run (no fingers down). */
	setCursor(cursor: string): void;
	destroy(): void;
};

export function attachGraphInput(options: {
	canvas: HTMLCanvasElement;
	rig: CameraRig;
	handlers: GraphInputHandlers;
}): GraphInput {
	const { canvas, rig, handlers } = options;
	const pointers = new Set<number>();
	let press: { id: number; x: number; y: number; moved: boolean } | null = null;
	let inside = false;
	let dirty = true;
	let x = 0;
	let y = 0;

	function onPointerMove(event: PointerEvent): void {
		x = event.clientX;
		y = event.clientY;
		inside = event.pointerType !== 'touch';
		dirty = true;
		if (press && Math.hypot(x - press.x, y - press.y) > DRAG_THRESHOLD) press.moved = true;
	}

	function onPointerDown(event: PointerEvent): void {
		rig.cancel();
		pointers.add(event.pointerId);
		press =
			pointers.size === 1 && event.button === 0
				? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
				: null;
		handlers.onclear();
	}

	function onPointerUp(event: PointerEvent): void {
		const clicked = press !== null && press.id === event.pointerId && !press.moved && pointers.size === 1;
		pointers.delete(event.pointerId);
		press = null;

		x = event.clientX;
		y = event.clientY;
		inside = event.pointerType !== 'touch';
		dirty = true;
		canvas.style.cursor = 'grab';

		if (clicked) handlers.onclick(event.clientX, event.clientY);
	}

	function onPointerCancel(event: PointerEvent): void {
		pointers.delete(event.pointerId);
		press = null;
		inside = false;
		handlers.onclear();
	}

	function onPointerLeave(): void {
		inside = false;
		handlers.onclear();
	}

	function onWheel(): void {
		rig.cancel();
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Home' || event.key === '0') {
			event.preventDefault();
			rig.reset();
			return;
		}
		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			rig.zoom(0.86);
			return;
		}
		if (event.key === '-') {
			event.preventDefault();
			rig.zoom(1.16);
			return;
		}
		if (!event.key.startsWith('Arrow')) return;

		event.preventDefault();
		rig.cancel();
		handlers.onclear();

		const { camera, controls } = rig;
		const offset = camera.position.clone().sub(controls.target);
		const spherical = new THREE.Spherical().setFromVector3(offset);

		if (event.key === 'ArrowLeft') spherical.theta -= KEY_YAW_STEP;
		if (event.key === 'ArrowRight') spherical.theta += KEY_YAW_STEP;
		if (event.key === 'ArrowUp') spherical.phi -= KEY_PITCH_STEP;
		if (event.key === 'ArrowDown') spherical.phi += KEY_PITCH_STEP;

		spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
		camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
		controls.update(0);
		dirty = true;
	}

	function onContextLost(event: Event): void {
		// Prevent the default so the browser will attempt a context restore; the
		// engine observes the same events to pause its render loop.
		event.preventDefault();
		handlers.oncontext?.(true);
	}

	function onContextRestored(): void {
		handlers.oncontext?.(false);
	}

	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointercancel', onPointerCancel);
	canvas.addEventListener('pointerleave', onPointerLeave);
	canvas.addEventListener('wheel', onWheel, { passive: true });
	canvas.addEventListener('keydown', onKeyDown);
	canvas.addEventListener('webglcontextlost', onContextLost);
	canvas.addEventListener('webglcontextrestored', onContextRestored);

	return {
		get pointerCount() {
			return pointers.size;
		},
		get x() {
			return x;
		},
		get y() {
			return y;
		},
		get pointerDirty() {
			return dirty;
		},
		canHover() {
			return inside && pointers.size === 0;
		},
		markHovered() {
			dirty = false;
		},
		setCursor(cursor) {
			canvas.style.cursor = cursor;
		},
		destroy() {
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerCancel);
			canvas.removeEventListener('pointerleave', onPointerLeave);
			canvas.removeEventListener('wheel', onWheel);
			canvas.removeEventListener('keydown', onKeyDown);
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);
		},
	};
}
