/**
 * Hybrid Logical Clock (HLC) — the ordering key for delta sync
 * (cloud sync design §4.3).
 *
 * Pure and dependency-free by design: the desktop app and the cloud service
 * share this exact comparison, so a clock skew on one device can never beat a
 * later write on another. Walls clocks alone cannot do that.
 *
 * Wire format: `{physical_ms}:{counter}:{device_id}`.
 */

/** The encoded form persisted and sent over the wire. */
export type Hlc = string;

export type ParsedHlc = {
	/** Wall-clock component in epoch milliseconds. */
	physical: number;
	/** Monotonic tie-breaker when the physical clock does not advance. */
	counter: number;
	/** Device that produced this clock; the deterministic final tie-break. */
	deviceId: string;
};

const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

/**
 * Encodes the three components. `deviceId` must not contain `:`; callers pass a
 * UUID or device slug, which never does.
 */
export function encodeHlc(physical: number, counter: number, deviceId: string): Hlc {
	return `${Math.floor(physical)}:${counter}:${deviceId}`;
}

/**
 * Parses an HLC. Returns `null` for anything that is not a well-formed triple,
 * so a corrupt row is treated as "no clock" rather than silently sorting last.
 */
export function parseHlc(value: string): ParsedHlc | null {
	const first = value.indexOf(':');
	if (first <= 0) return null;
	const second = value.indexOf(':', first + 1);
	if (second <= 0) return null;
	const physical = Number(value.slice(0, first));
	const counter = Number(value.slice(first + 1, second));
	const deviceId = value.slice(second + 1);
	if (!Number.isFinite(physical) || !Number.isSafeInteger(counter) || !deviceId) return null;
	return { physical, counter, deviceId };
}

/**
 * Total order over HLCs. Missing or malformed values sort first (oldest), so a
 * record without a clock never wins against a real one. Tie-breaks on
 * `deviceId` lexicographically, making the order deterministic regardless of
 * the order pushes arrive (§4.2 step 1).
 */
export function compareHlc(a: Hlc | null | undefined, b: Hlc | null | undefined): number {
	const pa = a ? parseHlc(a) : null;
	const pb = b ? parseHlc(b) : null;
	if (!pa && !pb) return 0;
	if (!pa) return -1;
	if (!pb) return 1;
	if (pa.physical !== pb.physical) return pa.physical < pb.physical ? -1 : 1;
	if (pa.counter !== pb.counter) return pa.counter < pb.counter ? -1 : 1;
	if (pa.deviceId === pb.deviceId) return 0;
	return pa.deviceId < pb.deviceId ? -1 : 1;
}

/**
 * Advances an HLC for a local event. If the wall clock has not moved past the
 * previous physical time, the counter increments instead, keeping the clock
 * strictly monotonic.
 */
export function tickHlc(previous: Hlc | null | undefined, now: number, deviceId: string): Hlc {
	const prev = previous ? parseHlc(previous) : null;
	if (!prev) return encodeHlc(now, 0, deviceId);
	const physical = Math.max(prev.physical, Math.floor(now));
	const counter = physical === prev.physical ? prev.counter + 1 : 0;
	return encodeHlc(physical, Math.min(counter, MAX_COUNTER), deviceId);
}
