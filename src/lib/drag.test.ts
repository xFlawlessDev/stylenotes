import { beforeEach, describe, expect, it, vi } from 'vitest';

const { win } = vi.hoisted(() => ({
	win: {
		outerPosition: vi.fn(async () => ({ x: 100, y: 200 })),
		scaleFactor: vi.fn(async () => 1),
		outerSize: vi.fn(async () => ({ width: 60, height: 304 })),
		setPosition: vi.fn(async () => undefined)
	}
}));

vi.mock('./windows', () => ({ isTauri: true }));
vi.mock('@tauri-apps/api/window', () => ({
	getCurrentWindow: () => win,
	currentMonitor: async () => ({
		position: { x: 0, y: 0 },
		size: { width: 1920, height: 1080 }
	}),
	PhysicalPosition: class {
		constructor(
			public x: number,
			public y: number
		) {}
	}
}));

import { edgeDrag, type EdgeDragOptions } from './drag';

function pointer(type: string, screenX: number, screenY: number) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(event, { button: 0, pointerId: 1, screenX, screenY });
	return event as unknown as PointerEvent;
}

function setup(options: EdgeDragOptions) {
	const node = document.createElement('button');
	node.setPointerCapture = vi.fn();
	node.releasePointerCapture = vi.fn();
	edgeDrag(node, options);
	return node;
}

/** Wait for the action's async window-state lookup to resolve. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
	win.setPosition.mockClear();
});

describe('edgeDrag on the vertical axis', () => {
	it('reports a press without movement as a click', async () => {
		const onClick = vi.fn();
		const onStateChange = vi.fn();
		const node = setup({ onClick, onStateChange });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointerup', 0, 0));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onStateChange).not.toHaveBeenCalled();
		expect(win.setPosition).not.toHaveBeenCalled();
	});

	it('still reports a click when the pointer stays under the threshold', async () => {
		const onClick = vi.fn();
		const onStateChange = vi.fn();
		const node = setup({ onClick, onStateChange });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointermove', 0, 2));
		node.dispatchEvent(pointer('pointerup', 0, 2));

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onStateChange).not.toHaveBeenCalled();
	});

	it('drags past the threshold and swallows the click', async () => {
		const onClick = vi.fn();
		const onStateChange = vi.fn();
		const node = setup({ onClick, onStateChange });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointermove', 0, 30));

		expect(onStateChange).toHaveBeenCalledWith(true);
		expect(win.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 100, y: 230 }));

		node.dispatchEvent(pointer('pointerup', 0, 30));

		expect(onStateChange).toHaveBeenLastCalledWith(false);
		expect(onClick).not.toHaveBeenCalled();
	});

	it('does not click when the press is cancelled', async () => {
		const onClick = vi.fn();
		const node = setup({ onClick });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointercancel', 0, 0));

		expect(onClick).not.toHaveBeenCalled();
	});

	it('clamps the drag inside the monitor', async () => {
		const node = setup({ onClick: vi.fn() });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointermove', 0, 5000));

		expect(win.setPosition).toHaveBeenCalledWith(expect.objectContaining({ y: 776 }));
	});
});

describe('edgeDrag on the horizontal axis', () => {
	it('moves only along x and freezes y', async () => {
		const onStateChange = vi.fn();
		const node = setup({ axis: 'x', onClick: vi.fn(), onStateChange });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointermove', 30, 500));

		expect(onStateChange).toHaveBeenCalledWith(true);
		expect(win.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 130, y: 200 }));
	});

	it('clamps the drag inside the monitor', async () => {
		const node = setup({ axis: 'x', onClick: vi.fn() });

		node.dispatchEvent(pointer('pointerdown', 0, 0));
		await settle();
		node.dispatchEvent(pointer('pointermove', 5000, 0));

		expect(win.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 1860, y: 200 }));
	});
});
