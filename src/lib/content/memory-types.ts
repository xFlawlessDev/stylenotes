/**
 * Shared contract for the semantic memory index (docs/design/constella-features.md #D3–#D6).
 *
 * Everything here is pure data: the embedder descriptor, the persisted vector
 * row, the suggestion/cluster records, and the meta-key names. Keeping it in one
 * module means the Rust commands, the repo and the store cannot drift on field
 * names.
 *
 * The index is a *derivative* (#D6): `embeddings` may be dropped and rebuilt
 * from `notes.body` at any time, so nothing here is a source of truth.
 */

/** Bumped whenever the vector row or the tool payload changes incompatibly. */
export const MEMORY_PROTOCOL = 1;

/**
 * How a vector was produced. `hashing` is the offline baseline (no model,
 * deterministic); `provider` calls an OpenAI-compatible `/embeddings` endpoint;
 * `onnx` runs a local ONNX sentence encoder.
 */
export type EmbedderKind = 'hashing' | 'provider' | 'onnx';

/** A concrete embedder the app can select, as reported to the UI. */
export type EmbedderDescriptor = {
	/** Stable identity written alongside every vector, e.g. `provider:text-embedding-3-small`. */
	id: string;
	kind: EmbedderKind;
	/** Human label for Settings. Not persisted. */
	label: string;
	/** Vector length; fixed per embedder, so a mismatch invalidates old rows. */
	dim: number;
	/**
	 * True when the embedder can run with no network and no API key. The
	 * hashing baseline and a downloaded ONNX model are offline; provider is not.
	 */
	offline: boolean;
	/** For `onnx`: approximate download size in bytes, for the "Download" button. */
	downloadBytes?: number;
};

/**
 * Kinds of entity a vector can describe. Notes and tasks share one table so a
 * query can retrieve across both (#D5).
 */
export type EmbedEntityKind = 'note' | 'task';

/** Row of `embeddings` (#D5). */
export type EmbeddingRow = {
	entityKind: EmbedEntityKind;
	entityId: string;
	/** `EmbedderDescriptor.id` at the time the vector was made. */
	model: string;
	dim: number;
	/** Decoded floats; never the raw BLOB outside the repo. */
	vec: number[];
	/** Hash of the source text; a change forces a re-embed. */
	contentHash: string;
	updatedAt: number;
};

/** What the index currently looks like, for the Settings status block. */
export type MemoryStatus = {
	/** The embedder selected in Settings, or null when memory is off. */
	selected: string | null;
	/** Number of entity rows carrying a vector for the selected model. */
	indexed: number;
	/** Entities that need embedding or re-embedding under the selected model. */
	pending: number;
	/** True while a backfill/rebuild is running. */
	indexing: boolean;
	/** Why the last run stopped early, when it did. */
	lastError: string | null;
};

/** Meta keys holding memory preferences (#Q2). Device-local, never synced. */
export const MEMORY_META_KEYS = {
	/** `EmbedderDescriptor.id` the user picked. */
	embedder: 'meta:memory/embedder',
	/** Cosine floor for a suggestion, as a decimal string. */
	threshold: 'meta:memory/threshold',
	/** Target cluster count for `list_themes`. */
	clusterCount: 'meta:memory/cluster-count',
	/** Set once the "semantic memory is off" nudge has been raised. */
	nudge: 'meta:memory/nudge',
} as const;

/** Default cosine floor above which a pair becomes an auto-link suggestion. */
export const MEMORY_DEFAULT_THRESHOLD = 0.72;

/** Default number of clusters requested from `clusters.ts`. */
export const MEMORY_DEFAULT_CLUSTERS = 6;

/** How many suggestions a single note may accrue per cycle (#D8). */
export const MEMORY_SUGGESTIONS_PER_NOTE = 3;

/** How many notes/tasks one `ai_embed` batch carries (#D16). */
export const MEMORY_EMBED_BATCH = 16;

/**
 * The offline baseline embedder. Deterministic, dependency-free, and honest:
 * it is a hashed bag of character trigrams, so cosine on it tracks lexical
 * overlap, not meaning. The design warns against shipping this as "semantic"
 * (#D2 option C), so the UI labels it as a baseline and the real model is an
 * opt-in upgrade.
 */
export const MEMORY_HASHING_EMBEDDER: EmbedderDescriptor = {
	id: 'hashing:trigram-v1',
	kind: 'hashing',
	label: 'Offline baseline',
	dim: 384,
	offline: true,
};

/** Provider embedding models offered in Settings; the user may type another. */
export const MEMORY_PROVIDER_MODELS: { id: string; label: string; dim: number }[] = [
	{ id: 'text-embedding-3-small', label: 'OpenAI text-embedding-3-small', dim: 1536 },
	{ id: 'text-embedding-3-large', label: 'OpenAI text-embedding-3-large', dim: 3072 },
];

/**
 * The prefix for a provider embedder id, so the model can be recovered from a
 * stored `model` string: `provider:<model>`.
 */
export const MEMORY_PROVIDER_PREFIX = 'provider:';
