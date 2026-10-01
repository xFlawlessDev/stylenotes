/**
 * Renders a tool result as text the model can read (pure, unit-tested).
 *
 * The old shape was `JSON.stringify(result)`: a note body arrived as a wall of
 * escaped quotes, and nothing separated the text of a note from the metadata
 * wrapped around it — a model asked to quote "the body" was just as likely to
 * quote `"updatedAt"`. This renderer keeps prose as prose and structure as
 * `key: value` lines, so the content and the fields describing it read apart,
 * and replaying it into the next request's history costs far fewer tokens.
 *
 * Protocol copy: everything here is read by the model, never by the user, so
 * it stays English whatever the app language is — the same rule as the tool
 * errors it wraps.
 */
import type { ToolResult } from '$lib/content/ai-tools';

/** Indentation of one nesting level. */
const INDENT = '  ';
/** A string this long, or a multi-line one, gets a block of its own. */
const BLOCK_STRING = 160;
/** A list entry stays on one line only while the line stays this short. */
const INLINE_ITEM = 200;
/** Guards against pathological nesting; JSON from the app is never this deep. */
const MAX_DEPTH = 8;

function isPrimitive(value: unknown): boolean {
	return value === null || value === undefined || typeof value !== 'object';
}

function scalarText(value: unknown): string {
	if (value === null || value === undefined) return 'null';
	return typeof value === 'string' ? value : String(value);
}

function isBlockString(value: unknown): value is string {
	return typeof value === 'string' && (value.includes('\n') || value.length > BLOCK_STRING);
}

function indent(text: string, prefix: string): string {
	return text
		.split('\n')
		.map((line) => prefix + line)
		.join('\n');
}

/** One bullet: only the first line carries the dash, the rest line up below it. */
function bullet(text: string): string {
	const [first, ...rest] = text.split('\n');
	return [`- ${first}`, ...rest.map((line) => `  ${line}`)].join('\n');
}

function renderValue(value: unknown, depth: number): string {
	if (isPrimitive(value)) return scalarText(value);
	if (depth >= MAX_DEPTH) return '[...]';
	if (Array.isArray(value)) {
		if (!value.length) return '[]';
		return value.map((item) => renderItem(item, depth + 1)).join('\n');
	}
	const entries = Object.entries(value as Record<string, unknown>);
	if (!entries.length) return '{}';
	return entries
		.map(([key, child]) => {
			if (isBlockString(child)) return `${key}:\n${indent(child, INDENT)}`;
			if (isPrimitive(child)) return `${key}: ${scalarText(child)}`;
			const nested = renderValue(child, depth + 1);
			// An empty container reads better inline than as a block of nothing.
			return nested === '[]' || nested === '{}'
				? `${key}: ${nested}`
				: `${key}:\n${indent(nested, INDENT)}`;
		})
		.join('\n');
}

/** An array entry: one line while it is a flat record, a block once it is not. */
function renderItem(item: unknown, depth: number): string {
	if (isBlockString(item)) return bullet(item);
	if (isPrimitive(item)) return `- ${scalarText(item)}`;
	if (Array.isArray(item)) return bullet(renderValue(item, depth));
	const entries = Object.entries(item as Record<string, unknown>);
	if (entries.length && entries.every(([key, child]) => isPrimitive(child) && !isBlockString(child))) {
		const line = entries.map(([key, child]) => `${key}: ${scalarText(child)}`).join(' · ');
		if (line.length <= INLINE_ITEM) return `- ${line}`;
	}
	return bullet(renderValue(item, depth));
}

/**
 * One tool result as the provider should receive it.
 *
 * A failure is stated up front so it cannot be mistaken for data: a model
 * reading `{"ok":false,...}` as JSON knew it failed, and a model reading a
 * bare string might not. Success needs no header — a rendered body *is* the
 * success case, and an empty one says so instead of sending a blank message
 * (Anthropic rejects those outright).
 */
export function formatToolResult(result: ToolResult): string {
	if (!result.ok) return `ERROR: ${result.error}`;
	return renderValue(result.data, 0).trim() || '(no content)';
}
