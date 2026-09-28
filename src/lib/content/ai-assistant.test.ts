import { describe, expect, it } from 'vitest';
import {
	AI_QUICK_ACTIONS,
	AI_TITLE_MAX,
	applyGeneratedText,
	availableApplyModes,
	buildActionMessage,
	sanitizeThreadTitle,
	titlePrompt
} from '$lib/content/ai-assistant';

describe('buildActionMessage', () => {
	it('embeds the note text for summarize', () => {
		const message = buildActionMessage('summarize', 'A long note');
		expect(message.role).toBe('user');
		expect(message.content).toContain('Summarize this note');
		expect(message.content).toContain('A long note');
	});

	it('falls back when the note is empty', () => {
		const message = buildActionMessage('rewrite', '   ');
		expect(message.content).toContain('(the note is empty)');
	});

	it('uses the custom instruction when provided', () => {
		const message = buildActionMessage('custom', 'Text', 'Make a checklist');
		expect(message.content).toContain('Make a checklist');
		expect(message.content).toContain('Text');
	});

	it('defaults the custom instruction when blank', () => {
		const message = buildActionMessage('custom', 'Text', '   ');
		expect(message.content).toContain('Help me with this note.');
	});
});

describe('availableApplyModes', () => {
	it('offers replace only when there is a selection', () => {
		expect(availableApplyModes(true)).toEqual(['replace', 'insert', 'copy']);
		expect(availableApplyModes(false)).toEqual(['insert', 'copy']);
	});
});

describe('applyGeneratedText', () => {
	const body = 'Hello world';

	it('replaces the selection and moves the caret past the text', () => {
		const result = applyGeneratedText(body, 6, 11, 'there', 'replace');
		expect(result.body).toBe('Hello there');
		expect(result.caret).toBe(11);
	});

	it('inserts at the selection end', () => {
		const result = applyGeneratedText(body, 5, 5, ' there', 'insert');
		expect(result.body).toBe('Hello there world');
		expect(result.caret).toBe(11);
	});

	it('leaves the body untouched for copy', () => {
		const result = applyGeneratedText(body, 0, 5, 'ignored', 'copy');
		expect(result.body).toBe(body);
	});

	it('trims trailing whitespace from generated text', () => {
		const result = applyGeneratedText('ab', 2, 2, 'cd\n\n', 'insert');
		expect(result.body).toBe('abcd');
	});
});

describe('AI_QUICK_ACTIONS', () => {
	it('only the custom action needs an instruction', () => {
		const needing = AI_QUICK_ACTIONS.filter((item) => item.needsInstruction).map((item) => item.id);
		expect(needing).toEqual(['custom']);
	});
});

describe('sanitizeThreadTitle', () => {
	it('strips quotes, markdown and trailing punctuation', () => {
		expect(sanitizeThreadTitle('"Weekly Review Plan."')).toBe('Weekly Review Plan');
		expect(sanitizeThreadTitle('## Roadmap ideas')).toBe('Roadmap ideas');
	});

	it('keeps only the first line', () => {
		expect(sanitizeThreadTitle('Sprint planning\nMore text here')).toBe('Sprint planning');
	});

	it('collapses whitespace', () => {
		expect(sanitizeThreadTitle('  a   b   c  ')).toBe('a b c');
	});

	it('returns empty for unusable output', () => {
		expect(sanitizeThreadTitle('   ')).toBe('');
		expect(sanitizeThreadTitle('"')).toBe('');
	});

	it('clips long titles at a word boundary', () => {
		const title = sanitizeThreadTitle('word '.repeat(30));
		expect(title.length).toBeLessThanOrEqual(AI_TITLE_MAX);
		expect(title.endsWith('word')).toBe(true);
	});
});

describe('titlePrompt', () => {
	it('includes only the first user and assistant turns', () => {
		const prompt = titlePrompt([
			{ role: 'user', content: 'first' },
			{ role: 'assistant', content: 'reply' },
			{ role: 'user', content: 'later' }
		]);
		expect(prompt.content).toContain('first');
		expect(prompt.content).toContain('reply');
		expect(prompt.content).not.toContain('later');
	});

	it('skips system messages', () => {
		const prompt = titlePrompt([
			{ role: 'system', content: 'ignore me' },
			{ role: 'user', content: 'hello' }
		]);
		expect(prompt.content).not.toContain('ignore me');
	});
});
