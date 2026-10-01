/**
 * Request history for the AI chat: rebuilding the provider transcript from
 * what was stored, and trimming it to fit (pure, unit-tested).
 *
 * The naive cut (`messages.slice(-max)`) treats every message as equally
 * disposable, which quietly breaks the two kinds that must never go: the
 * system blocks that carry the current question's context — `@mention`
 * bodies and the snapshot's truncation notice are unshifted to the *front*,
 * so a positional trim drops them first — and the assistant turn that a
 * `tool` message answers, whose loss leaves the provider a reply with no
 * matching call.
 *
 * Kept messages are returned in their original order, so the provider still
 * sees a well-formed conversation.
 */
import type { AiMessage, AiMessageRecord } from '$lib/content/ai-types';
import type { ToolResult } from '$lib/content/ai-tools';
import { formatToolResult } from '$lib/content/ai-tool-format';

/** The parts of a stored message that the provider transcript needs. */
export type StoredTurn = Pick<AiMessageRecord, 'role' | 'content' | 'toolCalls' | 'toolResults'>;

/** Total characters of replayed tool results the next request may carry. */
export const AI_HISTORY_TOOL_BUDGET = 24_000;
/** Head kept for a result once the budget is spent, so it still reads as one. */
const TRIM_HEAD = 400;
const TRIMMED = '…[earlier tool result trimmed to fit the context window]';

/**
 * Caps a history at `max` non-system messages, oldest first, while keeping
 * every system block regardless of age.
 *
 * System blocks are bounded (the notice is one message, `@mentions` are
 * computed per send and never persisted), so protecting them cannot grow the
 * request without limit — and they are exactly what tells the model what it
 * is allowed to know. Replayed tool turns count as ordinary messages: they
 * are context like any other, and `replayHistory`'s budget is what bounds
 * how much text they can carry.
 */
export function trimHistory(messages: AiMessage[], max: number): AiMessage[] {
	const blocks: AiMessage[] = [];
	const turns: AiMessage[] = [];
	for (const message of messages) {
		(message.role === 'system' ? blocks : turns).push(message);
	}

	// `Math.max(0, ...)` because slice(-0) would return the whole array.
	const start = Math.max(0, turns.length - Math.max(0, max));
	const kept = turns.slice(start);
	// Never open on a `tool` turn whose assistant partner was trimmed away:
	// OpenAI and Anthropic both reject an orphaned tool result.
	while (kept.length > 0 && kept[0].role === 'tool') kept.shift();

	return [...blocks, ...kept];
}

/**
 * Rebuilds the provider transcript from the messages that were stored.
 *
 * The store keeps one record per *send* — the answer, plus every tool call it
 * made and their results — while a provider turn expects the traffic to be
 * interleaved: the assistant asking, then one `tool` reply per call id. The
 * record is expanded back into that shape, so a question asked three turns ago
 * still sees what the assistant actually found rather than being told about it
 * from memory (and a result that was never recorded — the app closed mid-turn —
 * says so instead of letting a verdict be invented for it).
 *
 * Tool results are then handed a shared budget, newest first: the findings the
 * model is about to reason over keep their full text, while an older one only
 * keeps enough head to show that something was read.
 */
export function replayHistory(turns: StoredTurn[], budget = AI_HISTORY_TOOL_BUDGET): AiMessage[] {
	const messages: AiMessage[] = [];
	for (const turn of turns) {
		const calls = turn.toolCalls ?? [];
		if (turn.role !== 'assistant' || calls.length === 0) {
			messages.push({ role: turn.role, content: turn.content });
			continue;
		}
		// The assistant turn is echoed first so every result has the call it
		// answers; both providers reject a reply to a call that is not there.
		messages.push({ role: 'assistant', content: turn.content, toolCalls: calls });
		for (const call of calls) {
			messages.push({
				role: 'tool',
				toolCallId: call.id,
				content: replayedResult(call, turn.toolResults?.[call.id])
			});
		}
	}
	return fitToolBudget(messages, budget);
}

/** One stored result as the provider sees it again on the next turn. */
function replayedResult(call: { name: string }, result: ToolResult | undefined): string {
	// No entry means the app closed before the call reported back.
	if (!result) return `ERROR: no result was recorded for \`${call.name}\` — the app closed mid-turn.`;
	return formatToolResult(result);
}

/**
 * Spends `budget` across the tool turns, newest first, shrinking whatever no
 * longer fits to a readable head.
 *
 * Walking backwards is the whole policy: what the model has not yet reasoned
 * over is preserved exactly, and only the surplus of the past is cut. A result
 * shorter than the head is left alone rather than marked as trimmed for
 * nothing, and the marker keeps a shrunken result from reading as "no data".
 */
function fitToolBudget(messages: AiMessage[], budget: number): AiMessage[] {
	let left = Math.max(0, budget);
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== 'tool') continue;
		const text = message.content;
		if (text.length <= left) {
			left -= text.length;
			continue;
		}
		const keep = Math.max(left, TRIM_HEAD);
		left = 0;
		if (text.length > keep) message.content = `${text.slice(0, keep)}\n${TRIMMED}`;
	}
	return messages;
}
