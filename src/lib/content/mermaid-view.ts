/**
 * Pure pan/zoom maths for the Mermaid canvas viewer.
 *
 * The viewer keeps a single `scale` factor plus a `{ x, y }` translation and
 * renders the diagram with `transform: translate(x, y) scale(scale)`. Zooming
 * around a pointer (wheel or pinch) must keep the point under the cursor
 * fixed, which is what `zoomAt` computes.
 */

export type MermaidView = { scale: number; x: number; y: number };

export const MERMAID_MIN_SCALE = 0.2;
export const MERMAID_MAX_SCALE = 8;
export const MERMAID_ZOOM_STEP = 1.2;

export const INITIAL_MERMAID_VIEW: MermaidView = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
	if (!Number.isFinite(scale)) return 1;
	return Math.min(MERMAID_MAX_SCALE, Math.max(MERMAID_MIN_SCALE, scale));
}

/** Clamps a view's scale in place-safe fashion, returning a new object. */
export function normalizeView(view: MermaidView): MermaidView {
	const scale = clampScale(view.scale);
	return {
		scale,
		x: Number.isFinite(view.x) ? view.x : 0,
		y: Number.isFinite(view.y) ? view.y : 0,
	};
}

/**
 * Multiplies the current zoom by `factor` while keeping the diagram point under
 * `(originX, originY)` (viewer-relative pixels) at the same screen position.
 */
export function zoomAt(
	view: MermaidView,
	factor: number,
	originX: number,
	originY: number,
): MermaidView {
	const nextScale = clampScale(view.scale * factor);
	const ratio = nextScale / view.scale;
	return {
		scale: nextScale,
		x: originX - (originX - view.x) * ratio,
		y: originY - (originY - view.y) * ratio,
	};
}

/** Sets an absolute scale around a point, used by the zoom preset buttons. */
export function zoomTo(
	view: MermaidView,
	scale: number,
	originX: number,
	originY: number,
): MermaidView {
	return zoomAt(view, clampScale(scale) / view.scale, originX, originY);
}

export function panBy(view: MermaidView, dx: number, dy: number): MermaidView {
	return { scale: view.scale, x: view.x + dx, y: view.y + dy };
}

/**
 * Fits a `content`-sized diagram inside a `viewport`-sized stage, centred with a
 * small margin. Falls back to identity when either rectangle is unmeasured.
 */
export function fitView(
	viewportWidth: number,
	viewportHeight: number,
	contentWidth: number,
	contentHeight: number,
	padding = 32,
): MermaidView {
	if (
		viewportWidth <= 0 ||
		viewportHeight <= 0 ||
		contentWidth <= 0 ||
		contentHeight <= 0
	) {
		return { ...INITIAL_MERMAID_VIEW };
	}
	const inset = Math.max(0, padding) * 2;
	const scale = clampScale(
		Math.min(
			Math.max(1, viewportWidth - inset) / contentWidth,
			Math.max(1, viewportHeight - inset) / contentHeight,
		),
	);
	return {
		scale,
		x: (viewportWidth - contentWidth * scale) / 2,
		y: (viewportHeight - contentHeight * scale) / 2,
	};
}

/** Formats the current zoom as a percentage label ("125%"). */
export function formatZoom(scale: number): string {
	return `${Math.round(scale * 100)}%`;
}
