<script lang="ts">
	import { tick } from 'svelte';
	import { Loader2, Send } from '@lucide/svelte';
	import { Button, Textarea } from '$lib/components/base';
	import MentionPopover from '$lib/components/note/MentionPopover.svelte';
	import { t } from '$lib/i18n/index.svelte';
	import type { WikiSource } from '$lib/content/wiki-links';
	import {
		applyMention,
		mentionPool,
		mentionSuggestionsFor,
		moveMention,
		type MentionSuggestion
	} from '$lib/content/ai-mentions';

	/**
	 * The assistant composer: a textarea plus the `@` mention picker. It owns
	 * the mention state so the panel only receives the finished message.
	 */
	let {
		ready = false,
		sending = false,
		notes = [],
		tasks = [],
		workspaceId,
		onsubmit
	}: {
		ready?: boolean;
		sending?: boolean;
		notes?: WikiSource[];
		tasks?: WikiSource[];
		workspaceId?: string;
		onsubmit: (text: string) => void;
	} = $props();

	let input = $state('');
	let el = $state<HTMLTextAreaElement | null>(null);
	let index = $state(0);

	const pool = $derived(mentionPool({ notes, tasks }, workspaceId));
	const mentions = $derived(
		el ? mentionSuggestionsFor(input, el.selectionStart, { notes, tasks }, workspaceId) : null
	);
	const open = $derived(!!mentions?.items.length);

	/** Reading the caret is what makes the derived `mentions` recompute. */
	function refresh() {
		index = 0;
		void el?.selectionStart;
	}

	function choose(item: MentionSuggestion) {
		const current = mentions;
		const textarea = el;
		if (!current || !textarea) return;
		const next = applyMention(input, { start: current.query.start, end: current.query.end }, item.entity);
		input = next.value;
		void tick().then(() => {
			textarea.focus();
			textarea.setSelectionRange(next.caret, next.caret);
		});
	}

	/** Arrow/Enter/Escape belong to the mention list while it is open. */
	function handleKey(event: KeyboardEvent): boolean {
		const items = mentions?.items ?? [];
		if (!items.length) return false;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			index = moveMention(index, items.length, event.key === 'ArrowDown' ? 1 : -1);
			return true;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			choose(items[index] ?? items[0]);
			return true;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			// Drop the `@` so the list does not reopen.
			input = input.slice(0, Math.max(0, (mentions?.query.start ?? input.length) - 1));
			return true;
		}
		return false;
	}

	function submit() {
		const text = input.trim();
		if (!text || sending) return;
		input = '';
		index = 0;
		onsubmit(text);
	}
</script>

<div class="flex items-end gap-2 p-3">
	<Textarea
		bind:ref={el}
		variant="well"
		placeholder={ready ? t('ai.composerReady') : t('ai.composerDisabled')}
		aria-label={t('ai.composerLabel')}
		class="min-h-[40px] leading-6 text-body-sm"
		disabled={!ready}
		bind:value={input}
		oninput={refresh}
		onclick={refresh}
		onkeydown={(event) => {
			if (open && handleKey(event)) return;
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				submit();
			}
		}}
	/>
	<Button
		size="icon"
		shape="pill"
		variant="primary"
		aria-label={t('ai.send')}
		class="mt-2 self-start"
		disabled={!ready || sending || !input.trim()}
		onclick={submit}
	>
		{#if sending}<Loader2 size={15} class="animate-spin" />{:else}<Send size={15} />{/if}
	</Button>

	<MentionPopover
		{open}
		anchor={el}
		items={mentions?.items ?? []}
		index={index}
		onselect={choose}
		onhover={(position) => (index = position)}
	/>
</div>
