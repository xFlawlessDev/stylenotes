/**
 * Pure helpers for the semantic memory index (docs/design/constella-features.md).
 *
 * Three jobs, all deterministic and unit-tested:
 *  1. Compose the text that gets embedded for a note or task.
 *  2. Hash that text (`content_hash`) so an unchanged note is never re-embedded.
 *  3. Encode/decode vectors as `f32` little-endian bytes, the exact layout the
 *     Rust side reads — one definition, so the two never disagree (#D5).
 *
 * The offline baseline embedder lives here too: it is pure arithmetic and needs
 * no runtime, which is what lets the whole pipeline be tested in CI.
 */

import type { EmbedEntityKind, EmbedderDescriptor } from '$lib/content/memory-types';
import { MEMORY_HASHING_EMBEDDER } from '$lib/content/memory-types';

/** The fields of a note/task that the embed text is built from. */
export type EmbedSource = {
	kind: EmbedEntityKind;
	title: string;
	body: string;
	tags?: string[];
};

/**
 * The text handed to an embedder. Title leads (it carries the topic), tags are
 * appended as keywords (they are curated signal), body follows.
 *
 * Kept plain on purpose: this string is also what `content_hash` covers, so any
 * change here invalidates every vector, which is the correct outcome.
 */
export function embedText(source: EmbedSource): string {
	const parts: string[] = [];
	const title = source.title.trim();
	if (title) parts.push(title);
	if (source.tags?.length) {
		const tags = source.tags.map((tag) => tag.trim()).filter(Boolean);
		if (tags.length) parts.push(tags.join(' '));
	}
	const body = source.body.trim();
	if (body) parts.push(body);
	return parts.join('\n');
}

/**
 * A stable, fast hash of the source text. FNV-1a 64-bit, rendered as hex.
 *
 * Not cryptographic: it only needs to change when the text changes and be
 * stable across runs, and it is compared, never stored as a secret. A 32-bit
 * hash collided too readily across a few thousand notes to be safe as a
 * re-embed guard.
 */
export function contentHash(text: string): string {
	let hash = 0xcbf29ce484222325n;
	const prime = 0x100000001b3n;
	const mask = 0xffffffffffffffffn;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= BigInt(text.charCodeAt(i));
		hash = (hash * prime) & mask;
	}
	return hash.toString(16).padStart(16, '0');
}

/** True when a stored vector is still valid for the given text and embedder. */
export function hashMatches(
	stored: { contentHash: string; model: string; dim: number },
	text: string,
	embedder: EmbedderDescriptor
): boolean {
	return (
		stored.model === embedder.id &&
		stored.dim === embedder.dim &&
		stored.contentHash === contentHash(text)
	);
}

// --- vector codec (#D5) -----------------------------------------------------

/**
 * Packs floats as little-endian `f32`, exactly `dim * 4` bytes, matching the
 * Rust decoder. Round-tripping is lossy in the last bits (f32, not f64), so
 * tests compare with a tolerance rather than for equality.
 */
export function encodeVector(vec: number[]): Uint8Array {
	const out = new Uint8Array(vec.length * 4);
	const view = new DataView(out.buffer);
	for (let i = 0; i < vec.length; i += 1) {
		view.setFloat32(i * 4, vec[i], true);
	}
	return out;
}

/** Decodes little-endian `f32` bytes back to floats. */
export function decodeVector(bytes: Uint8Array): number[] {
	if (bytes.byteLength % 4 !== 0) {
		throw new Error(`vector byte length ${bytes.byteLength} is not a multiple of 4`);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const out: number[] = new Array(bytes.byteLength / 4);
	for (let i = 0; i < out.length; i += 1) {
		out[i] = view.getFloat32(i * 4, true);
	}
	return out;
}

/**
 * Normalises a stored vector into a `Uint8Array` of exactly `dim * 4` bytes, or
 * `null` when the value cannot be one.
 *
 * This is the guard that keeps a bad row from becoming a bad vector. It exists
 * because a vector written as a plain number array is bound by the SQL plugin as
 * text, not a BLOB: the row then holds thousands of characters instead of 1536
 * bytes, and decoding it silently yields the wrong number of floats. Accepting
 * only an exact length turns that into "not indexed", which the next build
 * rewrites.
 */
export function toVectorBytes(raw: unknown, dim: number): Uint8Array | null {
	let bytes: Uint8Array;
	if (raw instanceof Uint8Array) bytes = raw;
	else if (Array.isArray(raw)) bytes = Uint8Array.from(raw as number[]);
	else return null;
	if (dim <= 0 || bytes.byteLength !== dim * 4) return null;
	return bytes;
}

/**
 * Encodes a vector as Base64 for storage.
 *
 * `tauri-plugin-sql` has no BLOB binding: a `Uint8Array` crosses IPC as a JSON
 * array and is bound as text. Base64 is therefore the compact, plugin-safe form
 * — about 2 KB per 384-dim vector instead of the ~5 KB a JSON number array
 * costs, and it round-trips exactly.
 */
export function encodeVectorBase64(vec: number[]): string {
	return bytesToBase64(encodeVector(vec));
}

/** Decodes a Base64 vector, returning `null` for anything not exactly `dim*4`. */
export function decodeVectorBase64(raw: unknown, dim: number): number[] | null {
	if (typeof raw !== 'string') return null;
	const bytes = base64ToBytes(raw);
	if (!bytes) return null;
	const checked = toVectorBytes(bytes, dim);
	if (!checked) return null;
	return decodeVector(checked);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
	try {
		const binary = atob(value);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

// --- cosine (mirrors the Rust implementation) -------------------------------

/** Cosine similarity, or 0 when either side is all zeros or lengths differ. */
export function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let magA = 0;
	let magB = 0;
	for (let i = 0; i < a.length; i += 1) {
		dot += a[i] * b[i];
		magA += a[i] * a[i];
		magB += b[i] * b[i];
	}
	const denom = Math.sqrt(magA) * Math.sqrt(magB);
	return denom === 0 ? 0 : dot / denom;
}

// --- offline baseline embedder ----------------------------------------------

/** Character n-gram width for the hashing embedder. */
const HASH_GRAM = 3;

/**
 * Hashes `s` into `[0, dim)` with FNV-1a, so the same text always lands in the
 * same bucket on every platform and run.
 */
function bucket(s: string, dim: number): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		hash ^= s.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash % dim;
}

/**
 * The offline baseline: a signed, L2-normalised bag of character trigrams.
 *
 * This is lexical, not semantic — it exists so the index, the store and the
 * tools are exercisable with zero setup and in CI. The UI must present it as a
 * baseline, and `OnnxEmbedder`/`ProviderEmbedder` are the real recall paths.
 */
export function hashingEmbed(text: string, dim = MEMORY_HASHING_EMBEDDER.dim): number[] {
	const vec = new Array<number>(dim).fill(0);
	const normalized = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
	if (normalized.trim().length === 0) return vec;
	for (let i = 0; i + HASH_GRAM <= normalized.length; i += 1) {
		const gram = normalized.slice(i, i + HASH_GRAM);
		const slot = bucket(gram, dim);
		// A second, independent bit chooses the sign, so unrelated trigrams
		// cancelled to zero less often than a single-bucket counter did.
		const sign = bucket(`#${gram}`, 2) === 0 ? 1 : -1;
		vec[slot] += sign;
	}
	// Sublinear weighting keeps a long note from dominating a short one.
	for (let i = 0; i < dim; i += 1) {
		vec[i] = Math.sign(vec[i]) * Math.sqrt(Math.abs(vec[i]));
	}
	const magnitude = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
	if (magnitude === 0) return vec;
	return vec.map((value) => value / magnitude);
}
