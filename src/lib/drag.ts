import {
  getCurrentWindow,
  currentMonitor,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { isTauri } from "./windows";

/**
 * Svelte action: drag a window vertically only.
 * The horizontal position is frozen at drag start, and vertical movement is
 * clamped so the window always stays within the current monitor.
 */
export function verticalDrag(
  node: HTMLElement,
  onStateChange?: (dragging: boolean) => void
) {
  let dragging = false;
  let startPointerY = 0;
  let startWinX = 0;
  let startWinY = 0;
  let scale = 1;
  let minY = 0;
  let maxY = Number.POSITIVE_INFINITY;
  let raf = 0;
  let pendingY = 0;

  async function down(e: PointerEvent) {
    if (!isTauri || e.button !== 0) return;
    const win = getCurrentWindow();
    const [pos, factor, size, monitor] = await Promise.all([
      win.outerPosition(),
      win.scaleFactor(),
      win.outerSize(),
      currentMonitor(),
    ]);

    scale = factor;
    startWinX = pos.x;
    startWinY = pos.y;
    startPointerY = e.screenY;

    if (monitor) {
      minY = monitor.position.y;
      maxY = monitor.position.y + monitor.size.height - size.height;
    }

    dragging = true;
    onStateChange?.(true);
    node.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    const delta = Math.round((e.screenY - startPointerY) * scale);
    pendingY = Math.min(maxY, Math.max(minY, startWinY + delta));

    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        getCurrentWindow().setPosition(new PhysicalPosition(startWinX, pendingY));
      });
    }
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    onStateChange?.(false);
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    try {
      node.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);

  return {
    destroy() {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    },
  };
}