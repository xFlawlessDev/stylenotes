/**
 * Structured questions the assistant asks mid-turn.
 *
 * Ported from the `user_question` tool in the alnair gateway: the model offers
 * 2-4 labelled options and the user answers in the chat instead of guessing.
 * Everything here is pure so the validation and the answer shaping are testable
 * without a UI, and so a malformed call from the model cannot break the panel.
 */

/** One selectable option in a question card. */
export type QuestionOption = {
	label: string;
	/** Shown under the label; the model uses it to explain the trade-off. */
	description?: string;
};

/** A single question plus its options. */
export type QuestionItem = {
	question: string;
	/** Short chip above the question, e.g. "Scope". */
	header: string;
	options: QuestionOption[];
	/** True when more than one option may be chosen. */
	multiSelect: boolean;
};

/** How the user answered one question. */
export type QuestionAnswer =
	| { kind: 'option'; answer: string }
	| { kind: 'multi'; selected: string[] }
	/** The user typed their own answer instead of picking. */
	| { kind: 'custom'; answer: string }
	/** The user dismissed the card without answering. */
	| { kind: 'skipped' };

/** A question paired with what the user chose. */
export type AnsweredQuestion = QuestionItem & { answer: QuestionAnswer };

/**
 * Labels the UI reserves for its own controls. A model option using one of
 * these would be ambiguous — the user could not tell the model's choice from
 * the "type something" escape hatch.
 */
export const RESERVED_OPTION_LABELS = [
	'other',
	'type something',
	'skip',
	'none of these',
	'chat about this'
];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER_CHARS = 16;
export const MAX_LABEL_CHARS = 60;
export const MAX_QUESTIONS = 4;

function trim(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validates and normalises the raw tool arguments into questions.
 *
 * Returns an error string instead of throwing: the caller turns it into a tool
 * error the model can read and correct on the next step.
 */
export function parseQuestions(raw: string): { questions: QuestionItem[] } | { error: string } {
	let parsed: unknown;
	try {
		parsed = raw.trim() ? JSON.parse(raw) : {};
	} catch {
		return { error: 'Question arguments were not valid JSON.' };
	}
	const record = parsed as Record<string, unknown>;
	const list = Array.isArray(record.questions) ? record.questions : null;
	if (!list || !list.length) {
		return { error: '`questions` must be a non-empty array.' };
	}
	if (list.length > MAX_QUESTIONS) {
		return { error: `At most ${MAX_QUESTIONS} questions may be asked at once.` };
	}

	const questions: QuestionItem[] = [];
	for (const [index, entry] of list.entries()) {
		const item = (entry ?? {}) as Record<string, unknown>;
		const question = trim(item.question);
		const header = trim(item.header);
		if (!question) return { error: `Question ${index + 1} is missing its text.` };
		if (!header) return { error: `Question ${index + 1} is missing its header.` };
		if (header.length > MAX_HEADER_CHARS) {
			return { error: `Header “${header}” is longer than ${MAX_HEADER_CHARS} characters.` };
		}

		const rawOptions = Array.isArray(item.options) ? item.options : [];
		if (rawOptions.length < MIN_OPTIONS || rawOptions.length > MAX_OPTIONS) {
			return {
				error: `Question ${index + 1} needs ${MIN_OPTIONS}-${MAX_OPTIONS} options (got ${rawOptions.length}).`
			};
		}

		const seen = new Set<string>();
		const options: QuestionOption[] = [];
		for (const option of rawOptions) {
			const source =
				typeof option === 'string'
					? { label: option, description: '' }
					: ((option ?? {}) as Record<string, unknown>);
			const label = trim(source.label);
			if (!label) return { error: `An option in question ${index + 1} has no label.` };
			if (label.length > MAX_LABEL_CHARS) {
				return { error: `Option “${label}” is longer than ${MAX_LABEL_CHARS} characters.` };
			}
			if (RESERVED_OPTION_LABELS.includes(label.toLowerCase())) {
				return { error: `Option “${label}” is reserved by the UI.` };
			}
			const key = label.toLowerCase();
			if (seen.has(key)) return { error: `Duplicate option “${label}”.` };
			seen.add(key);
			options.push({ label, description: trim(source.description) || undefined });
		}

		questions.push({
			question,
			header,
			options,
			multiSelect: item.multiSelect === true
		});
	}

	return { questions };
}

/**
 * Shapes the answers into the tool result the model reads.
 *
 * Every question appears in the result, including skipped ones, so the model
 * knows what it still does not know instead of silently assuming.
 */
export function answerSummary(answered: AnsweredQuestion[]): {
	answered: number;
	cancelled: boolean;
	results: { header: string; question: string; answer: string }[];
} {
	const results = answered.map((item) => {
		let answer: string;
		switch (item.answer.kind) {
			case 'option':
				answer = item.answer.answer;
				break;
			case 'multi':
				answer = item.answer.selected.join(', ');
				break;
			case 'custom':
				answer = item.answer.answer;
				break;
			default:
				answer = '(skipped)';
		}
		return { header: item.header, question: item.question, answer };
	});
	return {
		answered: results.filter((item) => item.answer !== '(skipped)').length,
		// Nothing was answered: the model should stop and ask in plain text.
		cancelled: results.every((item) => item.answer === '(skipped)'),
		results
	};
}

/** True when a card can be submitted: single-select needs a choice, multi one or more. */
export function canSubmit(item: QuestionItem, answer: QuestionAnswer): boolean {
	switch (answer.kind) {
		case 'option':
			return Boolean(answer.answer);
		case 'multi':
			return answer.selected.length > 0;
		case 'custom':
			return Boolean(answer.answer.trim());
		default:
			return false;
	}
}
