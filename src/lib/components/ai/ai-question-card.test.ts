import { flushSync, mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { AnsweredQuestion, QuestionItem } from '$lib/content/ai-questions';

import AiQuestionCard from './AiQuestionCard.svelte';

function mountCard(questions: QuestionItem[], onsubmit: (answers: AnsweredQuestion[]) => void) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(AiQuestionCard as never, { target, props: { questions, onsubmit } });
	flushSync();
	return { target, app };
}

/** Finds a button by its visible text. */
function button(target: HTMLElement, text: string): HTMLButtonElement {
	const match = [...target.querySelectorAll('button')].find((element) =>
		element.textContent?.includes(text)
	);
	if (!match) throw new Error(`no button matching ${text}`);
	return match as HTMLButtonElement;
}

const single: QuestionItem = {
	question: 'Which workspace?',
	header: 'Scope',
	options: [{ label: 'Work' }, { label: 'Personal' }],
	multiSelect: false
};

const multi: QuestionItem = { ...single, multiSelect: true };

describe('AiQuestionCard', () => {
	it('renders every question header and option', () => {
		const { target, app } = mountCard([single], vi.fn());
		expect(target.textContent).toContain('Scope');
		expect(target.textContent).toContain('Which workspace?');
		expect(target.textContent).toContain('Work');
		expect(target.textContent).toContain('Personal');
		unmount(app);
	});

	it('submits the picked option', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([single], onsubmit);

		button(target, 'Work').click();
		flushSync();
		button(target, 'Send answers').click();

		expect(onsubmit).toHaveBeenCalledTimes(1);
		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers[0].answer).toEqual({ kind: 'option', answer: 'Work' });
		unmount(app);
	});

	/** Single-select starts empty, so the primary action is off until a pick. */
	it('disables submitting before the user picks', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([single], onsubmit);

		expect(button(target, 'Send answers').disabled).toBe(true);
		unmount(app);
	});

	it('replaces the choice when another option is picked', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([single], onsubmit);

		button(target, 'Work').click();
		flushSync();
		button(target, 'Personal').click();
		flushSync();
		button(target, 'Send answers').click();

		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers[0].answer).toEqual({ kind: 'option', answer: 'Personal' });
		unmount(app);
	});

	it('collects several answers for a multi-select question', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([multi], onsubmit);

		button(target, 'Work').click();
		flushSync();
		button(target, 'Personal').click();
		flushSync();
		button(target, 'Send answers').click();

		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers[0].answer).toEqual({ kind: 'multi', selected: ['Work', 'Personal'] });
		unmount(app);
	});

	it('toggles an already-chosen multi-select option off', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([multi], onsubmit);

		button(target, 'Work').click();
		flushSync();
		button(target, 'Personal').click();
		flushSync();
		// Deselecting "Work" leaves only "Personal".
		button(target, 'Work').click();
		flushSync();
		button(target, 'Send answers').click();

		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers[0].answer).toEqual({ kind: 'multi', selected: ['Personal'] });
		unmount(app);
	});

	/** With nothing chosen there is nothing to send, so the button is off. */
	it('disables submitting an empty multi-select', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([multi], onsubmit);

		expect(button(target, 'Send answers').disabled).toBe(true);
		button(target, 'Send answers').click();

		expect(onsubmit).not.toHaveBeenCalled();
		unmount(app);
	});

	/** The whole card must always be dismissible, or the turn deadlocks. */
	it('answers everything as skipped when told to decide for the user', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([single, multi], onsubmit);

		button(target, 'Decide for me').click();

		expect(onsubmit).toHaveBeenCalledTimes(1);
		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers).toHaveLength(2);
		expect(answers.every((item) => item.answer.kind === 'skipped')).toBe(true);
		unmount(app);
	});

	it('sends a typed answer', () => {
		const onsubmit = vi.fn();
		const { target, app } = mountCard([single], onsubmit);

		button(target, 'Type something').click();
		flushSync();

		const input = target.querySelector('input') as HTMLInputElement;
		input.value = 'Something else';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		button(target, 'Use').click();
		flushSync();
		button(target, 'Send answers').click();

		const answers = onsubmit.mock.calls[0][0] as AnsweredQuestion[];
		expect(answers[0].answer).toEqual({ kind: 'custom', answer: 'Something else' });
		unmount(app);
	});

	it('marks the picked option as pressed for assistive tech', () => {
		const { target, app } = mountCard([single], vi.fn());

		button(target, 'Work').click();
		flushSync();

		const pressed = [...target.querySelectorAll('button')].filter(
			(element) => element.getAttribute('aria-pressed') === 'true'
		);
		expect(pressed).toHaveLength(1);
		expect(pressed[0].textContent).toContain('Work');
		unmount(app);
	});
});
