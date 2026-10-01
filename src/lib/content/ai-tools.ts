/**
 * Executor for AI chat tool calls.
 *
 * The read tools live in `ai-read-tools.ts` (they filter the in-app snapshot,
 * the same document the MCP shim answers from, so a chat answer can never
 * disagree with the UI). This file keeps the write path — which delegates to
 * `mcp-write-actions.ts`, the same validated, event-emitting actions the MCP
 * bridge uses — plus the assistant-only tools and the dispatcher.
 *
 * Pure-ish: it takes the snapshot and write context as arguments, so it is
 * unit-testable without Tauri or the database.
 */

import {
	completeTaskAction,
	createNoteAction,
	createTaskAction,
	deleteNoteAction,
	deleteTaskAction,
	editNoteBodyAction,
	journalTodayAction,
	updateNoteAction,
	updateNoteBodyAction,
	updateTaskAction,
	type WriteContext,
	type WriteOutcome
} from '$lib/content/mcp-write-actions';
import { findAiTool } from '$lib/content/ai-tool-schema';
import { parseQuestions, answerSummary } from '$lib/content/ai-questions';
import { runRead, ASSISTANT_READS, type ToolContext, type ToolResult } from '$lib/content/ai-read-tools';
import { num, str } from '$lib/content/ai-read-helpers';

// The read module owns these types; re-exported here so callers have a single
// import site for the chat tool surface.
export type {
	ToolContext,
	ToolResult,
	MemoryHooks,
	MemoryHit,
	MemoryTheme,
	WebHooks
} from '$lib/content/ai-read-tools';

// --- write tools ------------------------------------------------------------

/** Maps a write action's coded failure into the model-facing error string. */
function fromWrite(outcome: WriteOutcome): ToolResult {
	return outcome.ok ? { ok: true, data: outcome.data } : { ok: false, error: outcome.message };
}

/**
 * Runs a write tool. Returns null when `name` is not a known write tool.
 * The caller must have already confirmed the action with the user.
 */
async function runWrite(
	ctx: ToolContext,
	name: string,
	args: Record<string, unknown>
): Promise<ToolResult | null> {
	switch (name) {
		case 'create_note':
			return fromWrite(await createNoteAction(ctx.write, args));
		case 'update_note_body':
			return fromWrite(await updateNoteBodyAction(ctx.write, args));
		case 'edit_note_body':
			return fromWrite(await editNoteBodyAction(ctx.write, args));
		case 'journal_today':
			return fromWrite(await journalTodayAction(ctx.write, args));
		case 'update_note':
			return fromWrite(await updateNoteAction(ctx.write, args));
		case 'delete_note':
			if (args.confirm !== true) return { ok: false, error: '`confirm` must be true to delete.' };
			return fromWrite(await deleteNoteAction(ctx.write, args));
		case 'create_task':
			return fromWrite(await createTaskAction(ctx.write, args));
		case 'update_task':
			return fromWrite(await updateTaskAction(ctx.write, args));
		case 'complete_task':
			return fromWrite(await completeTaskAction(ctx.write, args));
		case 'delete_task':
			if (args.confirm !== true) return { ok: false, error: '`confirm` must be true to delete.' };
			return fromWrite(await deleteTaskAction(ctx.write, args));
		default:
			return null;
	}
}

// --- assistant-only tools ---------------------------------------------------

/** Web search, or a clear message when it is not configured. */
async function webSearch(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.web) {
		return { ok: false, error: 'Web access is only available in the desktop app.' };
	}
	const query = str(args, 'query');
	if (!query) return { ok: false, error: '`query` is required.' };
	return ctx.web.search(query, num(args, 'limit', 5));
}

async function webFetch(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
	if (!ctx.web) {
		return { ok: false, error: 'Web access is only available in the desktop app.' };
	}
	const url = str(args, 'url');
	if (!url) return { ok: false, error: '`url` is required.' };
	const maxChars = num(args, 'maxChars', 12_000);
	return ctx.web.fetch(url, maxChars);
}

/**
 * Puts the model's questions to the user and waits for their answers.
 *
 * The wait is what makes this a real tool: the turn parks here until the card
 * is answered, and the answers become the tool result the model reads next.
 */
function askUserQuestion(
	ctx: ToolContext,
	rawArgs: string
): Promise<ToolResult> | ToolResult {
	if (!ctx.ask) {
		return { ok: false, error: 'Asking the user is not available here.' };
	}
	const parsed = parseQuestions(rawArgs);
	if ('error' in parsed) return { ok: false, error: parsed.error };

	return new Promise<ToolResult>((resolve) => {
		ctx.ask?.(parsed.questions, (answered) => {
			const summary = answerSummary(answered);
			resolve({ ok: true, data: summary });
		});
	});
}

// --- dispatch ---------------------------------------------------------------

/**
 * Executes one tool call. Read tools run immediately; write tools run only when
 * `confirmed` is true, so an unconfirmed write returns a refusal the model can
 * relay instead of mutating anything.
 *
 * `ask_user_question` is a read tool that blocks on the user rather than on
 * data, so it is awaited like a write.
 */
export async function executeToolCall(
	ctx: ToolContext,
	name: string,
	rawArgs: string,
	options: { confirmed: boolean }
): Promise<ToolResult> {
	const spec = findAiTool(name);
	if (!spec) return { ok: false, error: `Unknown tool \`${name}\`.` };

	if (spec.interactive) {
		return await askUserQuestion(ctx, rawArgs);
	}

	let args: Record<string, unknown>;
	try {
		args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
	} catch {
		return { ok: false, error: 'Tool arguments were not valid JSON.' };
	}

	if (spec.kind === 'read') {
		if (name === 'web_search') return webSearch(ctx, args);
		if (name === 'web_fetch') return webFetch(ctx, args);
		if (name === 'semantic_search') return ASSISTANT_READS.semanticSearch(ctx, args);
		if (name === 'related_notes') return ASSISTANT_READS.relatedNotes(ctx, args);
		if (name === 'list_themes') return ASSISTANT_READS.listThemes(ctx, args);
		if (name === 'find_contradictions') return ASSISTANT_READS.findContradictions(ctx, args);
		return runRead(ctx, name, args) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
	}
	if (!options.confirmed) {
		return { ok: false, error: 'The user declined this action.' };
	}
	return (await runWrite(ctx, name, args)) ?? { ok: false, error: `Unknown tool \`${name}\`.` };
}

/**
 * A readable sentence for an `edit_note_body` confirmation card.
 *
 * The confirmation is the user's only chance to catch a runaway sweep, so it
 * shows the needle and the scope rather than a generic "edit a note".
 */
function describeBodyEdit(args: Record<string, unknown>): string {
	if (args.op === 'insert') {
		const where = args.position === 'start' ? 'the start' : 'the end';
		return `Add text to ${where} of a note`;
	}
	const find = typeof args.find === 'string' ? args.find : '';
	const scope = args.occurrence === 'once' ? 'the first exact match' : 'every match';
	const shown = find.length > 60 ? `${find.slice(0, 60)}…` : find;
	return shown ? `Replace ${scope} of “${shown}” in a note` : 'Replace text in a note';
}

/** A short, human sentence describing what a call will do, for confirmation. */
export function describeToolCall(name: string, rawArgs: string): string {
	let args: Record<string, unknown> = {};
	try {
		args = rawArgs.trim() ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
	} catch {
		/* fall through to the generic label */
	}
	const title = typeof args.title === 'string' ? args.title : undefined;
	const query = typeof args.query === 'string' ? args.query : undefined;
	const url = typeof args.url === 'string' ? args.url : undefined;
	switch (name) {
		case 'create_note':
			return `Create a note${title ? ` “${title}”` : ''}`;
		case 'create_task':
			return `Create a task${title ? ` “${title}”` : ''}`;
		case 'update_note_body':
			return 'Replace a note’s body';
		case 'edit_note_body':
			return describeBodyEdit(args);
		case 'journal_today':
			return 'Open today’s journal entry';
		case 'update_note':
			return 'Update a note’s title, folder, tags or pin';
		case 'update_task':
			return 'Update a task';
		case 'complete_task':
			return 'Mark a task done';
		case 'delete_note':
			return 'Delete a note';
		case 'delete_task':
			return 'Delete a task';
		case 'web_search':
			return `Search the web${query ? ` for “${query}”` : ''}`;
		case 'web_fetch':
			return `Read ${url ?? 'a web page'}`;
		case 'ask_user_question':
			return 'Ask you a question';
		default:
			return name;
	}
}
