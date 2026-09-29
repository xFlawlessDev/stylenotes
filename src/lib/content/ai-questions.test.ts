import { describe, expect, it } from 'vitest';
import {
	answerSummary,
	canSubmit,
	parseQuestions,
	MAX_HEADER_CHARS,
	MAX_QUESTIONS,
	type AnsweredQuestion,
	type QuestionItem
} from '$lib/content/ai-questions';

/** A valid 2-option question, as the model would send it. */
const validArgs = (patch: Record<string, unknown> = {}) =>
	JSON.stringify({
		questions: [
			{
				question: 'Which workspace?',
				header: 'Scope',
				options: [{ label: 'Work' }, { label: 'Personal' }],
				...patch
			}
		]
	});

describe('parseQuestions', () => {
	it('accepts a well-formed question', () => {
		const result = parseQuestions(validArgs());
		expect('questions' in result).toBe(true);
		if (!('questions' in result)) return;
		expect(result.questions[0].header).toBe('Scope');
		expect(result.questions[0].options).toHaveLength(2);
		expect(result.questions[0].multiSelect).toBe(false);
	});

	it('rejects invalid JSON rather than throwing', () => {
		const result = parseQuestions('{not json');
		expect(result).toEqual({ error: 'Question arguments were not valid JSON.' });
	});

	it('rejects an empty question list', () => {
		const result = parseQuestions(JSON.stringify({ questions: [] }));
		expect('error' in result).toBe(true);
	});

	it('caps how many questions can be asked at once', () => {
		const many = Array.from({ length: MAX_QUESTIONS + 1 }, () => ({
			question: 'q',
			header: 'H',
			options: [{ label: 'a' }, { label: 'b' }]
		}));
		const result = parseQuestions(JSON.stringify({ questions: many }));
		expect('error' in result && 'error' in result ? result.error : '').toContain(
			`At most ${MAX_QUESTIONS}`
		);
	});

	it('requires 2 to 4 options', () => {
		const one = parseQuestions(validArgs({ options: [{ label: 'only' }] }));
		expect('error' in one).toBe(true);
		const five = parseQuestions(
			validArgs({ options: ['a', 'b', 'c', 'd', 'e'].map((label) => ({ label })) })
		);
		expect('error' in five).toBe(true);
	});

	it('accepts up to 4 options', () => {
		const four = parseQuestions(
			validArgs({ options: ['a', 'b', 'c', 'd'].map((label) => ({ label })) })
		);
		expect('questions' in four).toBe(true);
	});

	it('enforces the header length', () => {
		const result = parseQuestions(validArgs({ header: 'x'.repeat(MAX_HEADER_CHARS + 1) }));
		expect('error' in result).toBe(true);
	});

	it('rejects a missing header', () => {
		const result = parseQuestions(validArgs({ header: '  ' }));
		expect('error' in result).toBe(true);
	});

	/** A reserved label would collide with the card's own controls. */
	it('rejects labels the UI reserves', () => {
		const result = parseQuestions(
			validArgs({ options: [{ label: 'Other' }, { label: 'Fine' }] })
		);
		expect('error' in result && 'error' in result ? result.error : '').toContain('reserved');
	});

	it('rejects duplicate labels case-insensitively', () => {
		const result = parseQuestions(
			validArgs({ options: [{ label: 'Work' }, { label: 'WORK' }] })
		);
		expect('error' in result && 'error' in result ? result.error : '').toContain('Duplicate');
	});

	it('reads multiSelect and option descriptions', () => {
		const result = parseQuestions(
			validArgs({
				multiSelect: true,
				options: [
					{ label: 'A', description: 'first one' },
					{ label: 'B', description: '' }
				]
			})
		);
		if (!('questions' in result)) throw new Error('expected questions');
		expect(result.questions[0].multiSelect).toBe(true);
		expect(result.questions[0].options[0].description).toBe('first one');
		// An empty description becomes undefined rather than an empty line.
		expect(result.questions[0].options[1].description).toBeUndefined();
	});

	it('accepts bare string options', () => {
		const result = parseQuestions(validArgs({ options: ['One', 'Two'] }));
		if (!('questions' in result)) throw new Error('expected questions');
		expect(result.questions[0].options.map((option) => option.label)).toEqual(['One', 'Two']);
	});
});

const item: QuestionItem = {
	question: 'Which?',
	header: 'Pick',
	options: [{ label: 'A' }, { label: 'B' }],
	multiSelect: false
};

describe('canSubmit', () => {
	it('needs a choice for single-select', () => {
		expect(canSubmit(item, { kind: 'option', answer: 'A' })).toBe(true);
		expect(canSubmit(item, { kind: 'skipped' })).toBe(false);
	});

	it('needs at least one for multi-select', () => {
		expect(canSubmit(item, { kind: 'multi', selected: ['A'] })).toBe(true);
		expect(canSubmit(item, { kind: 'multi', selected: [] })).toBe(false);
	});

	it('ignores a blank custom answer', () => {
		expect(canSubmit(item, { kind: 'custom', answer: '  ' })).toBe(false);
		expect(canSubmit(item, { kind: 'custom', answer: 'x' })).toBe(true);
	});
});

describe('answerSummary', () => {
	const answered = (answer: AnsweredQuestion['answer']): AnsweredQuestion => ({ ...item, answer });

	it('reports a picked option', () => {
		const summary = answerSummary([answered({ kind: 'option', answer: 'A' })]);
		expect(summary.results[0].answer).toBe('A');
		expect(summary.answered).toBe(1);
		expect(summary.cancelled).toBe(false);
	});

	it('joins a multi-select', () => {
		const summary = answerSummary([answered({ kind: 'multi', selected: ['A', 'B'] })]);
		expect(summary.results[0].answer).toBe('A, B');
	});

	it('passes a custom answer through', () => {
		const summary = answerSummary([answered({ kind: 'custom', answer: 'something else' })]);
		expect(summary.results[0].answer).toBe('something else');
	});

	/** The model must see what it still does not know. */
	it('keeps skipped questions in the result', () => {
		const summary = answerSummary([answered({ kind: 'skipped' })]);
		expect(summary.results).toHaveLength(1);
		expect(summary.results[0].answer).toBe('(skipped)');
		expect(summary.answered).toBe(0);
	});

	it('marks the whole card cancelled only when everything was skipped', () => {
		const allSkipped = answerSummary([
			answered({ kind: 'skipped' }),
			answered({ kind: 'skipped' })
		]);
		expect(allSkipped.cancelled).toBe(true);

		const partial = answerSummary([
			answered({ kind: 'skipped' }),
			answered({ kind: 'option', answer: 'A' })
		]);
		expect(partial.cancelled).toBe(false);
		expect(partial.answered).toBe(1);
	});
});
