<script lang="ts">
	import { Check, Circle } from '@lucide/svelte';
	import { Button, Input } from '$lib/components/base';
	import { t } from '$lib/i18n/index.svelte';
	import type { AnsweredQuestion, QuestionAnswer, QuestionItem } from '$lib/content/ai-questions';
	import { canSubmit } from '$lib/content/ai-questions';

	/**
	 * The choice card for `ask_user_question`.
	 *
	 * Rendered in the chat instead of the generic Allow/Decline prompt when the
	 * assistant cannot resolve an ambiguity from the user's notes. The model
	 * parks on this card, so it must always be dismissible: every question has a
	 * Skip, and the whole card has a "Decide for me" escape so the turn can
	 * never deadlock on a user who does not want to choose.
	 */
	let {
		questions,
		onsubmit
	}: {
		questions: QuestionItem[];
		/** Called once, with every question (answered or skipped). */
		onsubmit: (answers: AnsweredQuestion[]) => void;
	} = $props();

	/** Current choice per question index, seeded lazily as the user interacts. */
	let picks = $state<Record<number, QuestionAnswer>>({});
	/** Which question is showing its free-text field. */
	let typingAt = $state<number | null>(null);
	let customDraft = $state('');

	/** The stored answer for a question, or "skipped" before the user touches it. */
	function pickAt(index: number): QuestionAnswer {
		return picks[index] ?? { kind: 'skipped' };
	}

	/**
	 * Submit needs a real answer for every question: an untouched question has
	 * no answer yet, and "skipped" is the explicit "Decide for me" path.
	 */
	const allAnswered = $derived(questions.every((item, index) => canSubmit(item, pickAt(index))));

	function pick(index: number, label: string, multi: boolean) {
		const current = pickAt(index);
		if (multi) {
			const selected = current.kind === 'multi' ? current.selected : [];
			const next = selected.includes(label)
				? selected.filter((item) => item !== label)
				: [...selected, label];
			picks = { ...picks, [index]: { kind: 'multi', selected: next } };
			return;
		}
		picks = { ...picks, [index]: { kind: 'option', answer: label } };
		typingAt = null;
	}

	function isChosen(index: number, label: string, multi: boolean): boolean {
		const current = pickAt(index);
		if (multi) return current.kind === 'multi' && current.selected.includes(label);
		return current.kind === 'option' && current.answer === label;
	}

	/** The typed answer for a question, or an empty string. */
	function customAnswerAt(index: number): string {
		const current = pickAt(index);
		return current.kind === 'custom' ? current.answer : '';
	}

	function startTyping(index: number) {
		typingAt = index;
		customDraft = '';
	}

	function commitCustom(index: number) {
		const text = customDraft.trim();
		if (!text) return;
		picks = { ...picks, [index]: { kind: 'custom', answer: text } };
		typingAt = null;
		customDraft = '';
	}

	function submit() {
		onsubmit(questions.map((item, index) => ({ ...item, answer: pickAt(index) })));
	}

	/** Answers everything as skipped, so the model proceeds without input. */
	function decideForMe() {
		onsubmit(questions.map((item) => ({ ...item, answer: { kind: 'skipped' } as QuestionAnswer })));
	}
</script>

<div class="flex flex-col gap-3 rounded-xl bg-tertiary-container/30 p-3">
	<span class="text-label-sm font-label text-on-surface">
		{t('ai.questionTitle')}
	</span>

	{#each questions as item, index (item.header + index)}
		<div class="flex flex-col gap-1.5">
			<div class="flex items-center gap-2">
				<span
					class="rounded-full bg-surface-container-lowest/60 px-2 py-0.5 text-label-sm font-label text-on-surface-variant"
				>
					{item.header}
				</span>
				{#if item.multiSelect}
					<span class="text-label-sm font-label text-outline">{t('ai.chooseAny')}</span>
				{/if}
			</div>
			<span class="text-body-sm font-body text-on-surface">{item.question}</span>

			<div class="flex flex-col gap-1">
				{#each item.options as option (option.label)}
					{@const chosen = isChosen(index, option.label, item.multiSelect)}
					<button
						type="button"
						class="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors {chosen
							? 'emphasis-container text-on-primary-container'
							: 'bg-surface-container-lowest/40 text-on-surface hover:bg-surface-container-lowest/70'}"
						aria-pressed={chosen}
						onclick={() => pick(index, option.label, item.multiSelect)}
					>
						{#if chosen}
							<Check size={13} class="mt-0.5 shrink-0" />
						{:else}
							<Circle size={13} class="mt-0.5 shrink-0 text-outline" />
						{/if}
						<span class="flex min-w-0 flex-col">
							<span class="text-label-sm font-label">{option.label}</span>
							{#if option.description}
								<span class="text-label-sm font-label text-outline">{option.description}</span>
							{/if}
						</span>
					</button>
				{/each}

				{#if typingAt === index}
					<div class="flex items-center gap-2">
						<Input
							size="sm"
							placeholder={t('ai.typeAnswer')}
							bind:value={customDraft}
							onkeydown={(event) => {
								if (event.key === 'Enter') commitCustom(index);
							}}
						/>
						<Button size="xs" shape="pill" variant="primary" onclick={() => commitCustom(index)}>
							{t('ai.use')}
						</Button>
					</div>
				{:else}
					<button
						type="button"
						class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-label-sm font-label {pickAt(
							index
						).kind === 'custom'
							? 'emphasis-container text-on-primary-container'
							: 'bg-surface-container-lowest/40 text-outline hover:bg-surface-container-lowest/70'}"
						onclick={() => startTyping(index)}
					>
						{#if pickAt(index).kind === 'custom'}
							<Check size={13} class="shrink-0" />
							<span class="truncate">{customAnswerAt(index)}</span>
						{:else}
							<Circle size={13} class="shrink-0" />
							{t('ai.typeAnything')}
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{/each}

	<div class="flex items-center gap-2">
		<Button variant="primary" size="xs" shape="pill" disabled={!allAnswered} onclick={submit}>
			{t('ai.sendAnswers')}
		</Button>
		<Button variant="secondary" size="xs" shape="pill" onclick={decideForMe}>
			{t('ai.decideForMe')}
		</Button>
	</div>
</div>
