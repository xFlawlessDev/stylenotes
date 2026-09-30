/**
 * Ranking and suggestion rules for semantic recall
 * (docs/design/constella-features.md #D8, #D11).
 *
 * Pure: it takes vectors already in hand and returns ranked ids and pairs. The
 * store owns the database and the embedder; this module owns the arithmetic and
 * the anti-spam policy, which is exactly the part worth unit-testing.
 */

import { cosine } from '$lib/content/embeddings';
import { MEMORY_SUGGESTIONS_PER_NOTE, type EmbedEntityKind } from '$lib/content/memory-types';

/** One entity with its vector, as the ranker sees it. */
export type VectorItem = {
	entityKind: EmbedEntityKind;
	entityId: string;
	vec: number[];
};

/** A ranked hit: the entity plus its similarity to the query vector. */
export type RankedHit = {
	entityKind: EmbedEntityKind;
	entityId: string;
	score: number;
};

/** The identity of an entity, independent of kind, for de-duplication. */
export type EntityRef = { entityKind: EmbedEntityKind; entityId: string };

/** A pair of entities with its similarity, always ordered (source < target). */
export type CandidatePair = {
	source: EntityRef;
	target: EntityRef;
	score: number;
};

export function refKey(ref: EntityRef): string {
	return `${ref.entityKind}:${ref.entityId}`;
}

/**
 * Orders two refs so a pair has one canonical direction. Without this the same
 * two notes produce two suggestions (A→B and B→A) and both show up (#D8).
 */
export function orderPair(a: EntityRef, b: EntityRef): [EntityRef, EntityRef] {
	const ka = refKey(a);
	const kb = refKey(b);
	return ka <= kb ? [a, b] : [b, a];
}

/** The canonical key of an unordered pair. */
export function pairKey(a: EntityRef, b: EntityRef): string {
	const [first, second] = orderPair(a, b);
	return `${refKey(first)}\0${refKey(second)}`;
}

/**
 * Ranks every candidate against a query vector, highest similarity first.
 *
 * `exclude` drops an entity (the query's own note) and `minScore` applies the
 * caller's floor. Ties fall back to the id so the order is stable across runs.
 */
export function rankBySimilarity(
	query: number[],
	items: VectorItem[],
	options: { exclude?: EntityRef; minScore?: number; limit?: number } = {}
): RankedHit[] {
	const excludeKey = options.exclude ? refKey(options.exclude) : null;
	const minScore = options.minScore ?? 0;
	const hits: RankedHit[] = [];
	for (const item of items) {
		if (excludeKey && refKey(item) === excludeKey) continue;
		const score = cosine(query, item.vec);
		if (score < minScore) continue;
		hits.push({ entityKind: item.entityKind, entityId: item.entityId, score });
	}
	hits.sort((a, b) => b.score - a.score || refKey(a).localeCompare(refKey(b)));
	return options.limit ? hits.slice(0, options.limit) : hits;
}

/**
 * Picks the auto-link suggestions a new vector produces (#D8).
 *
 * Three rules, applied in order:
 *  1. Never suggest a pair that already has a real edge.
 *  2. Never suggest a pair the user already rejected.
 *  3. Keep at most `perNote` per source note, and only one entry per unordered
 *     pair (a pair is ordered before it is compared).
 *
 * `alreadyLinked` and `decided` are keyed by `pairKey`, built by the caller from
 * the live graph and the `graph_suggestions` table.
 */
export function suggestPairs(
	source: VectorItem,
	items: VectorItem[],
	options: {
		threshold: number;
		perNote?: number;
		alreadyLinked: Set<string>;
		decided: Set<string>;
	}
): CandidatePair[] {
	const perNote = options.perNote ?? MEMORY_SUGGESTIONS_PER_NOTE;
	const seen = new Set<string>();
	const pairs: CandidatePair[] = [];

	for (const item of items) {
		if (refKey(item) === refKey(source)) continue;
		const key = pairKey(source, item);
		if (seen.has(key)) continue;
		seen.add(key);
		if (options.alreadyLinked.has(key) || options.decided.has(key)) continue;
		const score = cosine(source.vec, item.vec);
		if (score < options.threshold) continue;
		const [first, second] = orderPair(source, item);
		pairs.push({ source: first, target: second, score });
	}

	pairs.sort((a, b) => b.score - a.score || pairKey(a.source, a.target).localeCompare(pairKey(b.source, b.target)));
	return pairs.slice(0, perNote);
}

/**
 * A one-line, English explanation stored on a suggestion. Persisted text is
 * never translated (AGENTS.md), so the UI localises a stable shape instead.
 */
export function suggestionReason(score: number): string {
	return `Semantically similar (${score.toFixed(2)})`;
}

/** Clamps a similarity threshold read from settings into a usable range. */
export function normalizeThreshold(raw: string | null, fallback: number): number {
	if (raw === null) return fallback;
	const parsed = Number.parseFloat(raw);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(1, Math.max(0, parsed));
}
