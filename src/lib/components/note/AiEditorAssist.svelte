<script lang="ts">
	import { onMount } from 'svelte';
	import { Sparkles } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import AiAssistantPopover from '$lib/components/note/AiAssistantPopover.svelte';
	import { applyGeneratedText, type AiApplyMode } from '$lib/content/ai-assistant';
	import { hydrateAi } from '$lib/stores/ai.svelte';

	/**
	 * The AI affordance that lives in the note header: a toggle button plus the
	 * popover. It reads the selection from the textarea when it opens, so it
	 * always acts on what the user highlighted, and reports the applied body
	 * back to the editor.
	 */
	let {
		body,
		textarea,
		onapply
	}: {
		body: string;
		/** The editor textarea, read live for the current selection. */
		textarea: HTMLTextAreaElement | null;
		/** Called with the new body and caret once generated text is applied. */
		onapply: (body: string, caret: number) => void;
	} = $props();

	let anchor = $state<HTMLButtonElement | null>(null);
	let open = $state(false);
	/** Snapshot of what the assistant should act on, taken when it opens. */
	let target = $state({ text: '', start: 0, end: 0 });

	const hasSelection = $derived(target.end > target.start);

	onMount(() => {
		void hydrateAi();
	});

	function toggle() {
		if (!open) {
			const el = textarea;
			const start = el?.selectionStart ?? 0;
			const end = el?.selectionEnd ?? 0;
			target =
				end > start
					? { text: body.slice(start, end), start, end }
					: { text: body, start: body.length, end: body.length };
		}
		open = !open;
	}

	function apply(generated: string, mode: AiApplyMode) {
		const result = applyGeneratedText(body, target.start, target.end, generated, mode);
		open = false;
		onapply(result.body, result.caret);
	}
</script>

<Button
	bind:ref={anchor}
	variant={open ? 'tonal' : 'secondary'}
	size="sm"
	shape="pill"
	aria-label="Open AI assistant"
	onclick={toggle}
>
	<Sparkles size={14} /> AI
</Button>

{#if open}
	<AiAssistantPopover
		{anchor}
		text={target.text}
		{hasSelection}
		onselect={apply}
		onclose={() => (open = false)}
	/>
{/if}
