/**
 * GLSL for the 3D graph scene.
 *
 * Ported from the reference orbital graph: soft additive point sprites with a
 * glow halo, plus a bright core marker and a selection ring drawn in the
 * fragment shader so it scales with the point, not the geometry. Kept in its own
 * module because the engine file holds rendering logic, not shader source.
 */

/**
 * Graph nodes. `aSize` and `aStrength` are updated every frame while an
 * appearance transition is settling (see `graph-engine`), so both are dynamic
 * attributes. `aId` lets the fragment shader draw the selection ring without a
 * second draw call.
 */
export const NODE_VERTEX_SHADER = /* glsl */ `
	attribute vec3 aColor;
	attribute float aSize;
	attribute float aStrength;
	attribute float aId;

	uniform float uDpr;
	uniform float uSelected;

	varying vec3 vColor;
	varying float vStrength;
	varying float vSelected;

	void main() {
		vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

		gl_Position = projectionMatrix * viewPosition;

		// A screen-space floor preserves visibility at the furthest zoom.
		gl_PointSize =
			aSize *
			uDpr *
			clamp(110.0 / max(1.0, -viewPosition.z), 0.72, 1.65);

		vColor = aColor;
		vStrength = aStrength;

		vSelected = 1.0 - step(0.5, abs(aId - uSelected));
	}
`;

export const NODE_FRAGMENT_SHADER = /* glsl */ `
	varying vec3 vColor;
	varying float vStrength;
	varying float vSelected;

	void main() {
		float r = length(gl_PointCoord - 0.5) * 2.0;

		if (r > 1.0) discard;

		// A solid body inside a soft halo. The body must be *opaque* out to its
		// own radius: ribbons are drawn underneath and meet the node's centre, so
		// a translucent node would leave the line visibly poking through and the
		// graph would read as disconnected.
		float body = 1.0 - smoothstep(0.34, 0.44, r);

		// Contact rim: a slightly brighter ring at the body's edge, so the ribbon
		// appears to terminate at a defined boundary.
		float rim = 1.0 - smoothstep(0.012, 0.055, abs(r - 0.38));

		float halo =
			exp(-r * r * 4.5) * 0.06 +
			exp(-r * r * 16.0) * 0.14;

		float ring =
			(1.0 - smoothstep(0.015, 0.05, abs(r - 0.66))) *
			vSelected *
			0.3;

		// The body dominates the alpha so it occludes; the halo adds glow around it.
		float alpha = (body * 0.98 + rim * 0.16 + halo + ring) * vStrength;

		alpha *= 1.0 - smoothstep(0.82, 1.0, r);

		// Brighten the rim and keep the body close to its legend colour, so the
		// node reads as a solid marker rather than a bloom.
		vec3 color = mix(vColor, vec3(1.0), rim * 0.45);

		gl_FragColor = vec4(color, alpha);

		#include <colorspace_fragment>
	}
`;

/**
 * Relationship segments. Straight, not curved: a link must visibly join its two
 * nodes at every angle, and a bowed arc drifts away from the chord as the camera
 * moves, which reads as a connection floating free of the graph.
 *
 * Thickness still comes from the GPU (a line primitive is capped at one device
 * pixel). Each segment is a quad whose vertices are offset perpendicular to the
 * *segment itself* in screen space, so the width is correct from any viewpoint:
 * `aSide` picks the edge, `aWidth` is the thickness in CSS pixels, and
 * `uResolution` converts pixels to world units at that vertex's depth.
 *
 * `aColor` is per-vertex (a ribbon has four corners) and every corner reads the
 * same colour: the link kind's own token, exactly as the legend's Links swatch
 * shows it. See `graphEdgeColor`.
 */
export const EDGE_VERTEX_SHADER = /* glsl */ `
	attribute vec3 aColor;
	attribute float aOpacity;
	attribute float aSide;
	attribute float aWidth;
	attribute vec3 aOther;

	uniform vec2 uResolution;
	uniform float uScale;
	uniform float uHalfFovTan;

	varying vec3 vColor;
	varying float vOpacity;

	void main() {
		vColor = aColor;
		vOpacity = aOpacity;

		vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
		vec4 viewOther = modelViewMatrix * vec4(aOther, 1.0);

		// Screen-space direction of the segment: project both endpoints and take the
		// delta. Doing this per-vertex is what keeps the ribbon perpendicular from
		// every camera angle, including looking straight down the segment's axis,
		// where a world-space normal built on the CPU would collapse to zero.
		vec4 clipHere = projectionMatrix * viewPosition;
		vec4 clipOther = projectionMatrix * viewOther;

		// Guard w away from zero rather than clamping it: a clamped negative w
		// would mirror the point and flip the direction.
		float hereW = abs(clipHere.w) < 1e-6 ? 1e-6 : clipHere.w;
		float otherW = abs(clipOther.w) < 1e-6 ? 1e-6 : clipOther.w;
		vec2 direction = (clipOther.xy / otherW) - (clipHere.xy / hereW);

		// Clip space is square; the viewport is not. Correct before measuring.
		float aspect = uResolution.x / max(1.0, uResolution.y);
		direction.x *= aspect;

		// Compare against a pixel-scale epsilon: at this depth, one CSS pixel spans
		// 2 * halfFovTan * |z| / height in normalised units. A threshold that
		// ignored depth would treat a distant, briefly-short segment as degenerate.
		float pixel = 2.0 * uHalfFovTan * max(1.0, -viewPosition.z) / max(1.0, uResolution.y);

		if (length(direction) < pixel) {
			// Both endpoints land on the same pixel: the segment is edge-on, so its
			// screen direction carries no information. Any perpendicular will do;
			// keep the quad non-degenerate so the dot never vanishes.
			direction = vec2(1.0, 0.0);
		} else {
			direction = normalize(direction);
		}

		// Perpendicular to the segment on screen, back in clip space.
		vec2 offset = vec2(-direction.y, direction.x);
		offset.x /= aspect;

		// World units per CSS pixel at this vertex's depth.
		float worldPerPixel = -2.0 * viewPosition.z * uHalfFovTan / uResolution.y;

		viewPosition.xy += offset * aSide * aWidth * uScale * worldPerPixel;

		gl_Position = projectionMatrix * viewPosition;
	}
`;

export const EDGE_FRAGMENT_SHADER = /* glsl */ `
	precision highp float;

	varying vec3 vColor;
	varying float vOpacity;

	void main() {
		gl_FragColor = vec4(vColor, vOpacity);

		#include <colorspace_fragment>
	}
`;

/**
 * Single-point decorative core at the scene origin. `uColor` carries the theme
 * accent so the glow follows the workspace instead of a hardcoded hue.
 */
export const CORE_VERTEX_SHADER = /* glsl */ `
	uniform float uDpr;

	void main() {
		vec4 p = modelViewMatrix * vec4(position, 1.0);

		gl_Position = projectionMatrix * p;

		gl_PointSize = clamp(4200.0 / max(1.0, -p.z), 22.0, 58.0) * uDpr;
	}
`;

export const CORE_FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uColor;

	void main() {
		float r = length(gl_PointCoord - 0.5) * 2.0;

		if (r > 1.0) discard;

		float alpha =
			exp(-r * r * 8.0) * 0.09 +
			exp(-r * r * 75.0) * 0.72;

		gl_FragColor = vec4(uColor, alpha);

		#include <colorspace_fragment>
	}
`;
