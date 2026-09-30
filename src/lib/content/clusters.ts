/**
 * Local clustering for `list_themes` (docs/design/constella-features.md #D9).
 *
 * k-means over the stored vectors, deterministic via a fixed seed, with no LLM
 * in the loop: clustering is grouping, and grouping is arithmetic. Labels come
 * from a simple term frequency over the cluster's text, so the feature works
 * offline; an LLM relabel is a future refinement, not a dependency.
 *
 * Pure and unit-tested. The store owns the vectors and the database.
 */

import { cosine } from '$lib/content/embeddings';

/** One entity with its vector, as the clusterer sees it. */
export type ClusterItem = {
	entityKind: 'note' | 'task';
	entityId: string;
	vec: number[];
	/** Text used only to derive the cluster label; never embedded here. */
	text: string;
};

/** One cluster: its members and a label derived from their shared terms. */
export type Cluster = {
	id: number;
	label: string;
	members: { entityKind: 'note' | 'task'; entityId: string; score: number }[];
};

/**
 * A tiny deterministic PRNG (mulberry32). Deterministic output matters: the
 * same vault must cluster the same way on every run, or the graph's colours
 * would rearrange themselves for no reason the user can see.
 */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state |= 0;
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Dot product of a unit-normalised vector with a centroid. */
function dot(a: number[], b: number[]): number {
	let sum = 0;
	const length = Math.min(a.length, b.length);
	for (let i = 0; i < length; i += 1) sum += a[i] * b[i];
	return sum;
}

/**
 * Clusters vectors into at most `target` groups with k-means++ seeding.
 *
 * `k` is clamped to the item count; empty input yields no clusters. Fewer items
 * than `k` returns one cluster per item rather than degenerate empty clusters.
 */
export function clusterVectors(items: ClusterItem[], target: number, seed = 1729): Cluster[] {
	if (items.length === 0) return [];
	const k = Math.max(1, Math.min(Math.floor(target) || 1, items.length));
	if (k === 1 || items.length === 1) {
		return [buildCluster(0, items, items.map((item) => 1))];
	}

	const dim = items[0].vec.length;
	const random = seededRandom(seed);

	// k-means++ seeding: spread the initial centroids out deterministically.
	const centroids: number[][] = [items[Math.floor(random() * items.length)].vec.slice()];
	while (centroids.length < k) {
		const weights = items.map((item) => {
			const best = Math.max(...centroids.map((centroid) => dot(item.vec, centroid)));
			return Math.max(0, 1 - best) ** 2;
		});
		const total = weights.reduce((sum, weight) => sum + weight, 0);
		let pick = total > 0 ? random() * total : random();
		let index = 0;
		for (; index < items.length - 1; index += 1) {
			pick -= weights[index];
			if (pick <= 0) break;
		}
		centroids.push(items[index].vec.slice());
	}

	const assignment = new Array<number>(items.length).fill(0);
	for (let iteration = 0; iteration < 24; iteration += 1) {
		let moved = false;
		for (let i = 0; i < items.length; i += 1) {
			let best = 0;
			let bestScore = -Infinity;
			for (let c = 0; c < centroids.length; c += 1) {
				const score = dot(items[i].vec, centroids[c]);
				if (score > bestScore) {
					bestScore = score;
					best = c;
				}
			}
			if (assignment[i] !== best) {
				assignment[i] = best;
				moved = true;
			}
		}
		// Recompute centroids; a cluster with no members keeps its old centre so
		// the run stays stable instead of collapsing.
		const sums = centroids.map(() => new Array<number>(dim).fill(0));
		const counts = centroids.map(() => 0);
		for (let i = 0; i < items.length; i += 1) {
			counts[assignment[i]] += 1;
			for (let d = 0; d < dim; d += 1) sums[assignment[i]][d] += items[i].vec[d];
		}
		for (let c = 0; c < centroids.length; c += 1) {
			if (counts[c] === 0) continue;
			for (let d = 0; d < dim; d += 1) centroids[c][d] = sums[c][d] / counts[c];
		}
		if (!moved) break;
	}

	const groups = new Map<number, ClusterItem[]>();
	for (let i = 0; i < items.length; i += 1) {
		const list = groups.get(assignment[i]) ?? [];
		list.push(items[i]);
		groups.set(assignment[i], list);
	}

	return [...groups.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([id, members], index) =>
			buildCluster(
				index,
				members,
				members.map((member) => dot(member.vec, centroids[id]))
			)
		);
}

function buildCluster(id: number, members: ClusterItem[], scores: number[]): Cluster {
	return {
		id,
		label: labelFor(members),
		members: members.map((member, index) => ({
			entityKind: member.entityKind,
			entityId: member.entityId,
			score: scores[index] ?? 0
		}))
	};
}

/** Words too common to name a theme. Kept small and English; not copy. */
const STOP_WORDS = new Set([
	'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are', 'was',
	'were', 'will', 'would', 'can', 'could', 'should', 'not', 'but', 'you', 'your',
	'our', 'their', 'its', 'into', 'over', 'under', 'about', 'after', 'before',
	'note', 'notes', 'task', 'tasks', 'untitled'
]);

/**
 * A short label for a cluster: the most frequent distinctive words across its
 * members, joined. Falls back to the first member's title when nothing stands
 * out, so a label is never empty.
 */
export function labelFor(members: ClusterItem[], maxWords = 3): string {
	const counts = new Map<string, number>();
	for (const member of members) {
		const seen = new Set<string>();
		for (const raw of member.text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
			const word = raw.trim();
			if (word.length < 3 || STOP_WORDS.has(word) || seen.has(word)) continue;
			seen.add(word);
			counts.set(word, (counts.get(word) ?? 0) + 1);
		}
	}
	const ranked = [...counts.entries()]
		// A word shared by more members is a stronger signal than one repeated
		// inside a single member, so member count leads and raw count breaks ties.
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, maxWords)
		.map(([word]) => word);
	if (ranked.length) return ranked.join(' · ');
	const first = members[0]?.text.trim().split('\n')[0]?.trim();
	return first ? first.slice(0, 40) : 'Theme';
}

/** Mean pairwise cosine of a cluster's members; 1 for a single member. */
export function clusterCohesion(members: ClusterItem[]): number {
	if (members.length < 2) return 1;
	let total = 0;
	let pairs = 0;
	for (let i = 0; i < members.length; i += 1) {
		for (let j = i + 1; j < members.length; j += 1) {
			total += cosine(members[i].vec, members[j].vec);
			pairs += 1;
		}
	}
	return pairs === 0 ? 1 : total / pairs;
}
