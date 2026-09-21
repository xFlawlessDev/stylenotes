import {
  getCurrentWindow,
  currentMonitor,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { isTauri } from "./windows";

export type DragAxis = "x" | "y";

export type EdgeDragOptions = {
  /** Screen axis the window travels along. Defaults to "y". */
  axis?: DragAxis;
  /** Fired when a press ends without travelling past `threshold` pixels. */
  onClick?: () => void;
  /** Fired when a press becomes a drag and again when the drag ends. */
  onStateChange?: (dragging: boolean) => void;
  /** Pointer travel in pixels before a press counts as a drag. */
  threshold?: number;
};

/**
 * Svelte action: drag a window along one screen axis.
 *
 * The dock is pinned to a screen edge, so only the free axis moves; the other
 * position is frozen at drag start and movement is clamped to the current
 * monitor. A press that never travels past `threshold` pixels is reported as a
 * click, so one control can toggle on click and reposition on drag.
 */
export function edgeDrag(node: HTMLElement, options: EdgeDragOptions = {}) {
  let opts = options;
  let pressed = false;
  let ready = false;
  let dragging = false;
  let pressToken = 0;
  let axis: DragAxis = "y";
  let startPointer = 0;
  let startWinX = 0;
  let startWinY = 0;
  let startPos = 0;
  let scale = 1;
  let minPos = 0;
  let maxPos = Number.POSITIVE_INFINITY;
  let raf = 0;
  let pending = 0;

  function pointerPos(event: PointerEvent) {
    return axis === "x" ? event.screenX : event.screenY;
  }

  async function prepare(token: number) {
    const win = getCurrentWindow();
    const [pos, factor, size, monitor] = await Promise.all([
      win.outerPosition(),
      win.scaleFactor(),
      win.outerSize(),
      currentMonitor(),
    ]);
    if (token !== pressToken || !pressed) return;

    scale = factor;
    startWinX = pos.x;
    startWinY = pos.y;
    startPos = axis === "x" ? pos.x : pos.y;
    if (monitor) {
      minPos = axis === "x" ? monitor.position.x : monitor.position.y;
      maxPos =
        axis === "x"
          ? monitor.position.x + monitor.size.width - size.width
          : monitor.position.y + monitor.size.height - size.height;
    } else {
      minPos = 0;
      maxPos = Number.POSITIVE_INFINITY;
    }
    ready = true;
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pressed = true;
    ready = false;
    dragging = false;
    axis = opts.axis ?? "y";
    startPointer = pointerPos(event);
    node.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (isTauri) void prepare(++pressToken);
  }

  function move(event: PointerEvent) {
    if (!pressed || !ready) return;
    if (!dragging) {
      if (Math.abs(pointerPos(event) - startPointer) < (opts.threshold ?? 4)) return;
      dragging = true;
      opts.onStateChange?.(true);
    }

    const delta = Math.round((pointerPos(event) - startPointer) * scale);
    pending = Math.min(maxPos, Math.max(minPos, startPos + delta));

    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        getCurrentWindow().setPosition(
          axis === "x"
            ? new PhysicalPosition(pending, startWinY)
            : new PhysicalPosition(startWinX, pending),
        );
      });
    }
  }

  function finish(event: PointerEvent, clicked: boolean) {
    if (!pressed) return;
    const wasDragging = dragging;
    pressed = false;
    ready = false;
    dragging = false;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    try {
      node.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (wasDragging) opts.onStateChange?.(false);
    else if (clicked) opts.onClick?.();
  }

  const onUp = (event: PointerEvent) => finish(event, true);
  const onCancel = (event: PointerEvent) => finish(event, false);

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", onUp);
  node.addEventListener("pointercancel", onCancel);

  return {
    update(next: EdgeDragOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onCancel);
    },
  };
}
