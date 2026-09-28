/**
 * Pure helpers for the AI assistant UI.
 *
 * Kept out of the Svelte components so the prompt shaping and the
 * insert/replace decisions are unit-testable, per the repo convention that
 * non-UI logic lives in `$lib/content`.
 */

import type { AiMessage, AiTask } from '$lib/content/ai-types';

/** Longest title the UI will keep; longer output is clipped at a word boundary. */
export const AI_TITLE_MAX = 60;

/**
 * Cleans a model-generated chat title: strips quotes/markdown, collapses
 * whitespace and clips to `AI_TITLE_MAX`. Returns an empty string when nothing
 * usable remains, so the caller can keep the fallback title.
 */
export function sanitizeThreadTitle(raw: string): string {
	const cleaned = raw
		.split(/\r?\n/)[0]
		.replace(/^[#*\-\s]+/, '')
		.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.!?,;:]+$/, '')
		.trim();
	if (!cleaned) return '';
	if (cleaned.length <= AI_TITLE_MAX) return cleaned;
	const clipped = cleaned.slice(0, AI_TITLE_MAX);
	const lastSpace = clipped.lastIndexOf(' ');
	return (lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/** The message sent to the model when naming a thread. */
export function titlePrompt(exchange: AiMessage[]): AiMessage {
	const digest = exchange
		.filter((message) => message.role !== 'system')
		.slice(0, 2)
		.map((message) => `${message.role}: ${message.content}`)
		.join('\n\n');
	return {
		role: 'user',
		content: `Name this conversation in 3 to 6 words.\n\n${digest}`
	};
}


/** One writing action offered in the editor popover. */
export type AiQuickAction = {
	id: AiTask;
	label: string;
	/** Short description shown under the label. */
	description: string;
	/** True when the action needs an explicit custom instruction. */
	needsInstruction: boolean;
};

export const AI_QUICK_ACTIONS: AiQuickAction[] = [
	{
		id: 'summarize',
		label: 'Summarize',
		description: 'Condense the note into key points',
		needsInstruction: false
	},
	{
		id: 'rewrite',
		label: 'Rewrite',
		description: 'Improve clarity and structure',
		needsInstruction: false
	},
	{
		id: 'continue',
		label: 'Continue writing',
		description: 'Pick up from where the note ends',
		needsInstruction: false
	},
	{
		id: 'custom',
		label: 'Custom instruction',
		description: 'Tell the assistant exactly what to do',
		needsInstruction: true
	}
];

/**
 * Builds the single user message sent for a quick action. The selection (or
 * the whole body) is embedded so the model has the text it must act on.
 */
export function buildActionMessage(
	action: AiTask,
	text: string,
	instruction?: string
): AiMessage {
	const trimmed = text.trim();
	const body = trimmed.length ? trimmed : '(the note is empty)';
	switch (action) {
		case 'summarize':
			return { role: 'user', content: `Summarize this note:\n\n${body}` };
		case 'rewrite':
			return { role: 'user', content: `Rewrite this text:\n\n${body}` };
		case 'continue':
			return { role: 'user', content: `Continue this note:\n\n${body}` };
		default: {
			const ask = instruction?.trim() || 'Help me with this note.';
			return { role: 'user', content: `${ask}\n\nText:\n\n${body}` };
		}
	}
}

/** What the result buttons should do after a generation finishes. */
export type AiApplyMode = 'replace' | 'insert' | 'copy';

/**
 * Decides which apply actions make sense. Replace is only offered when a real
 * selection exists, so the user never overwrites the whole note by accident.
 */
export function availableApplyModes(hasSelection: boolean): AiApplyMode[] {
	return hasSelection ? ['replace', 'insert', 'copy'] : ['insert', 'copy'];
}

/**
 * Applies generated text to the editor body.
 *
 * `start`/`end` are the current selection offsets. Replace swaps the selection;
 * insert drops the text at the end of the selection. Returns the new body and
 * the caret to restore.
 */
export function applyGeneratedText(
	body: string,
	start: number,
	end: number,
	generated: string,
	mode: AiApplyMode
): { body: string; caret: number } {
	if (mode === 'copy') return { body, caret: end };
	const text = generated.trimEnd();
	if (mode === 'replace') {
		const next = body.slice(0, start) + text + body.slice(end);
		return { body: next, caret: start + text.length };
	}
	const next = body.slice(0, end) + text + body.slice(end);
	return { body: next, caret: end + text.length };
}
