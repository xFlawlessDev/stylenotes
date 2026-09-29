/**
 * Pure helpers for the assistant's trace UI (reasoning + tool calls).
 *
 * The panel and the components stay dumb: everything that decides what a
 * collapsed block says, and how big its payload is, lives here so it can be
 * unit-tested without Svelte or the database.
 */

import type { AiToolCall } from '$lib/content/ai-types';
import { toolLabel } from '$lib/content/ai-tool-schema';
import type { ToolResult } from '$lib/content/ai-tools';

/** One tool call as the UI shows it: what ran, and how it ended. */
export type ToolTraceEntry = {
	call: AiToolCall;
	/** Absent while the call is still running (or was interrupted). */
	result?: ToolResult;
};

/**
 * A tool's lifecycle. `running` covers a call the model just requested;
 * `interrupted` is a call with no recorded result, which can only mean the app
 * closed mid-turn — never invent a verdict for it.
 */
export type ToolTraceStatus = 'running' | 'done' | 'failed' | 'interrupted';

export function toolTraceStatus(result?: ToolResult): ToolTraceStatus {
	if (!result) return 'running';
	return result.ok ? 'done' : 'failed';
}

/** Short label for the badge next to a tool name. */
export function toolStatusLabel(status: ToolTraceStatus): string {
	switch (status) {
		case 'done':
			return 'Done';
		case 'failed':
			return 'Failed';
		case 'interrupted':
			return 'Interrupted';
		default:
			return 'Running';
	}
}

/** What the collapsed tool block says: the human tool name. */
export function toolTraceTitle(entry: ToolTraceEntry): string {
	return toolLabel(entry.call.name);
}

/**
 * Best-effort one-line summary of a call's result, for the collapsed row.
 * Returns an empty string when the result has nothing short to say.
 */
export function toolResultSummary(result?: ToolResult): string {
	if (!result) return '';
	if (!result.ok) return result.error;
	const data = result.data;
	if (typeof data === 'string') return data;
	if (Array.isArray(data)) return `${data.length} item${data.length === 1 ? '' : 's'}`;
	if (data && typeof data === 'object') {
		const record = data as Record<string, unknown>;
		for (const key of ['title', 'name', 'id', 'count', 'total']) {
			const value = record[key];
			if (typeof value === 'string' || typeof value === 'number') return String(value);
		}
		return `${Object.keys(record).length} field${Object.keys(record).length === 1 ? '' : 's'}`;
	}
	return '';
}

/** Pretty-prints a call's raw arguments; invalid JSON is shown verbatim. */
export function prettyArguments(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '{}';
	try {
		return JSON.stringify(JSON.parse(trimmed), null, 2);
	} catch {
		return trimmed;
	}
}

/** Pretty-prints a tool result for the expanded block. */
export function prettyResult(result?: ToolResult): string {
	if (!result) return '';
	return JSON.stringify(result, null, 2);
}

/**
 * Rebuilds the inline trace for a saved assistant message.
 *
 * A stored record has the calls and a map of results; a call with no entry was
 * left `interrupted` by an app restart, which is a different story from
 * "declined", so it is preserved rather than dropped.
 */
export function toolTraceFromRecord(
	calls: AiToolCall[],
	results: Record<string, ToolResult>
): ToolTraceEntry[] {
	return calls.map((call) => ({ call, result: results[call.id] }));
}

/**
 * Human phrasing for the reasoning header, e.g. "Thought for a few seconds".
 * `seconds` is measured by the component while the stream runs.
 */
export function reasoningLabel(streaming: boolean, seconds: number): string {
	if (streaming) return 'Thinking…';
	if (seconds <= 0) return 'Thought quickly';
	if (seconds === 1) return 'Thought for 1 second';
	return `Thought for ${seconds} seconds`;
}
