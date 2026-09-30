/**
 * Pure body-editing logic for `edit_note_body` (docs/design/mcp-local-free.md #D18).
 *
 * The point of these two operations is token cost: an agent that wants to
 * rename one word in a 400-line note should not have to read the note and send
 * it back. It sends a needle instead, and gets a count to verify with.
 *
 * Everything here is a pure string transform with a coded verdict, so the
 * "did it apply" question is answered before any write happens. A refusal is
 * always `bad_arguments` with a reason the model can act on — never a silent
 * partial edit, because a half-applied rename is worse than a failed call.
 */

import type { McpErrorCode } from '$lib/content/mcp-types';

/** Which occurrence a `replace` applies to. */
export type Occurrence = 'once' | 'all';

/** Where an `insert` lands. */
export type InsertPosition = 'start' | 'end';

export type BodyEdit =
	| { ok: true; body: string; matched: number; replaced: number }
	| { ok: false; error: McpErrorCode; message: string };

export function isOccurrence(value: unknown): value is Occurrence {
	return value === 'once' || value === 'all';
}

export function isInsertPosition(value: unknown): value is InsertPosition {
	return value === 'start' || value === 'end';
}

/** How many times `needle` occurs in `haystack`. Overlapping hits count once. */
export function countOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
}

/**
 * Applies a text replacement.
 *
 * `occurrence: "once"` requires the needle to be unique. Guessing the first hit
 * is how an agent renames the wrong thing in a vault where the word appears in
 * a heading and in three other sentences; refusing makes the agent supply
 * enough context to be unambiguous.
 */
export function applyReplace(
	body: string,
	find: string,
	replace: string,
	occurrence: Occurrence
): BodyEdit {
	if (!find) {
		// `replaceAll('')` inserts between every character; that is data loss,
		// not an edit, so an empty needle is never accepted.
		return { ok: false, error: 'bad_arguments', message: '`find` must not be empty.' };
	}
	const matched = countOccurrences(body, find);
	if (matched === 0) {
		return {
			ok: false,
			error: 'bad_arguments',
			message: '`find` does not appear in this note. Read it with get_note to copy the exact text.'
		};
	}
	if (occurrence === 'once' && matched > 1) {
		return {
			ok: false,
			error: 'bad_arguments',
			message: `\`find\` appears ${matched} times; include more surrounding context to make it unique, or pass occurrence: "all".`
		};
	}
	if (occurrence === 'once') {
		const at = body.indexOf(find);
		return {
			ok: true,
			body: body.slice(0, at) + replace + body.slice(at + find.length),
			matched,
			replaced: 1
		};
	}
	return { ok: true, body: body.split(find).join(replace), matched, replaced: matched };
}

/**
 * Inserts `text` at the start or the end of the body.
 *
 * `position: "end"` puts exactly one separator newline between the old body and
 * the new text: appending to an empty note must not leave a blank first line,
 * and appending to a body that already ends in a newline must not double it.
 * The separator is app-owned; a model-chosen one would drift call to call.
 */
export function applyInsert(body: string, text: string, position: InsertPosition): BodyEdit {
	if (!text) {
		return { ok: false, error: 'bad_arguments', message: '`text` must not be empty.' };
	}
	if (position === 'start') {
		const separator = body ? '\n\n' : '';
		return { ok: true, body: `${text}${separator}${body}`, matched: 0, replaced: 0 };
	}
	if (!body) return { ok: true, body: text, matched: 0, replaced: 0 };
	const trimmed = body.replace(/\n+$/, '');
	return { ok: true, body: `${trimmed}\n\n${text}`, matched: 0, replaced: 0 };
}
