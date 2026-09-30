/**
 * Contradiction detection (docs/design/constella-features.md #D10).
 *
 * Vectors alone cannot decide that two notes disagree: two near-identical texts
 * may be perfectly consistent. So this runs in two stages — pick *candidates* by
 * cosine (turning O(n²) into a few dozen pairs), then ask an LLM to verify each
 * one. Only a verified pair becomes a suggestion, and even then the user decides
 * (#D7).
 *
 * Pure and unit-tested. The caller supplies the candidate texts and runs the
 * model call; the prompt and the verdict parsing live here so both are testable
 * without a provider.
 */

import { cosine } from '$lib/content/embeddings';

/** One entity with its vector and the text the model will compare. */
export type ContradictionItem = {
	entityKind: 'note' | 'task';
	entityId: string;
	title: string;
	text: string;
	vec: number[];
};

/** A candidate pair, most similar first. */
export type CandidatePair = {
	source: ContradictionItem;
	target: ContradictionItem;
	score: number;
};

/** The model's verdict for one pair. */
export type Verdict = 'contradicts' | 'consistent' | 'unrelated';

/** A verified contradiction, ready to become a suggestion. */
export type Contradiction = {
	source: ContradictionItem;
	target: ContradictionItem;
	score: number;
	reason: string;
};

/**
 * Picks the top-`limit` most similar pairs as verification candidates.
 *
 * Only pairs whose similarity clears `minScore` are considered, and each
 * unordered pair appears once. This is the expensive-search filter: the model
 * only ever sees this short list.
 */
export function candidatePairs(
	items: ContradictionItem[],
	options: { minScore: number; limit: number }
): CandidatePair[] {
	const pairs: CandidatePair[] = [];
	for (let i = 0; i < items.length; i += 1) {
		for (let j = i + 1; j < items.length; j += 1) {
			const score = cosine(items[i].vec, items[j].vec);
			if (score < options.minScore) continue;
			pairs.push({ source: items[i], target: items[j], score });
		}
	}
	pairs.sort((a, b) => b.score - a.score);
	return pairs.slice(0, Math.max(0, options.limit));
}

/** Caps how much of each note the model sees, so a long note cannot flood it. */
const MAX_BODY_CHARS = 1500;

/**
 * The prompt for one pair. English, like all protocol copy (AGENTS.md): the
 * model must answer in a fixed vocabulary the parser below understands.
 */
export function verificationPrompt(pair: CandidatePair): string {
	const trim = (text: string) =>
		text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text;
	return [
		'Two notes are shown below. Decide whether the second directly contradicts',
		'the first: they make claims that cannot both be true. Differences in topic,',
		'emphasis, or level of detail are NOT contradictions. Only a factual or',
		'logical conflict counts.',
		'',
		`Note A — ${pair.source.title}`,
		trim(pair.source.text),
		'',
		`Note B — ${pair.target.title}`,
		trim(pair.target.text),
		'',
		'Reply with exactly one word on the first line: contradicts, consistent, or unrelated.',
		'On the second line, if it contradicts, quote the conflicting claim in at most 20 words.'
	].join('\n');
}

/**
 * Parses a model reply into a verdict and a short reason.
 *
 * A reply that does not open with a known verdict is treated as `unrelated`,
 * never as a contradiction: a false positive costs the user's trust, and an
 * unparsable answer is no evidence at all.
 */
export function parseVerdict(raw: string): { verdict: Verdict; reason: string } {
	const lines = raw
		.trim()
		.split('\n')
		.map((line) => line.trim());
	const first = (lines[0] ?? '').toLowerCase();
	const verdict: Verdict = first.startsWith('contradict')
		? 'contradicts'
		: first.startsWith('consistent')
			? 'consistent'
			: 'unrelated';
	const reason = verdict === 'contradicts' ? (lines.slice(1).join(' ').trim().slice(0, 200)) : '';
	return { verdict, reason };
}

/**
 * Turns verified pairs into contradictions, dropping everything the model did
 * not explicitly call a contradiction.
 */
export function verifiedContradictions(
	results: { pair: CandidatePair; raw: string }[]
): Contradiction[] {
	const out: Contradiction[] = [];
	for (const { pair, raw } of results) {
		const { verdict, reason } = parseVerdict(raw);
		if (verdict !== 'contradicts') continue;
		out.push({
			source: pair.source,
			target: pair.target,
			score: pair.score,
			reason: reason || `Contradicts (${pair.score.toFixed(2)})`
		});
	}
	return out;
}

/** The English sentence stored on a contradiction suggestion. */
export function contradictionReason(reason: string): string {
	return reason.trim() || 'The notes make conflicting claims';
}
