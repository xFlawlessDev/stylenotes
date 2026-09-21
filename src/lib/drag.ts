import {
  getCurrentWindow,
  currentMonitor,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { isTauri } from "./windows";

export type VerticalDragOptions = {
  /** Fired when a press ends without travelling past `threshold` pixels. */
  onClick?: () => void;
  /** Fired when a press becomes a drag and again when the drag ends. */
  onStateChange?: (dragging: boolean) => void;
  /** Pointer travel in pixels before a press counts as a drag. */
  threshold?: number;
};

/**
 * Svelte action: drag a window vertically only.
 *
 * A press that never travels past `threshold` pixels is reported as a click, so
 * one control can toggle on click and reposition on drag. The horizontal
 * position is frozen at drag start, and vertical movement is clamped so the
 * window always stays within the current monitor.
 */
export function verticalDrag(node: HTMLElement, options: VerticalDragOptions) {
  let opts = options;
  let pressed = false;
  let ready = false;
  let dragging = false;
  let pressToken = 0;
  let startPointerY = 0;
  let startWinX = 0;
  let startWinY = 0;
  let scale = 1;
  let minY = 0;
  let maxY = Number.POSITIVE_INFINITY;
  let raf = 0;
  let pendingY = 0;

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
    if (monitor) {
      minY = monitor.position.y;
      maxY = monitor.position.y + monitor.size.height - size.height;
    }
    ready = true;
  }

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pressed = true;
    ready = false;
    dragging = false;
    startPointerY = event.screenY;
    node.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (isTauri) void prepare(++pressToken);
  }

  function move(event: PointerEvent) {
    if (!pressed || !ready) return;
    if (!dragging) {
      if (Math.abs(event.screenY - startPointerY) < (opts.threshold ?? 4)) return;
      dragging = true;
      opts.onStateChange?.(true);
    }

    const delta = Math.round((event.screenY - startPointerY) * scale);
    pendingY = Math.min(maxY, Math.max(minY, startWinY + delta));

    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        getCurrentWindow().setPosition(new PhysicalPosition(startWinX, pendingY));
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
    update(next: VerticalDragOptions) {
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
