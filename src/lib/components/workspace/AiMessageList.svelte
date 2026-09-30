<script lang="ts">
	import { computePosition, flip, offset, shift } from '@floating-ui/dom';
	import { Check, Copy } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import AiMessageBody from '$lib/components/note/AiMessageBody.svelte';
	import AiReasoning from '$lib/components/ai/AiReasoning.svelte';
	import AiSources from '$lib/components/ai/AiSources.svelte';
	import AiToolTrace from '$lib/components/ai/AiToolTrace.svelte';
	import AiCitationPopover from '$lib/components/ai/AiCitationPopover.svelte';
	import type { AiMessageRecord } from '$lib/content/ai-types';
	import type { WikiClick } from '$lib/content/wiki-links';
	import { collectCitations, type CitationEntity, type CitationSource } from '$lib/content/ai-citations';
	import { toolTraceFromRecord } from '$lib/content/ai-trace';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The list of past turns.
	 *
	 * Extracted from `AiChatPanel.svelte` so the panel stays a shell over the
	 * conversation state. It is presentational: it renders whatever messages it
	 * is given and lifts navigation (`onwikilink`, `onsource`) to the parent,
	 * which knows how to route a note/task click. Copy state is local because
	 * nothing outside the list needs it.
	 *
	 * It also owns the citation preview: hovering an inline `[n]` marker or a
	 * source row shows one floating card (there is only ever one hover at a
	 * time), positioned with floating-ui against the hovered element's rect so
	 * it flips and shifts to stay on screen. `entities` are the live notes/tasks,
	 * used so the preview shows the current text rather than the older excerpt.
	 */
	let {
		messages,
		entities = [],
		onwikilink,
		onsource
	}: {
		messages: AiMessageRecord[];
		entities?: CitationEntity[];
		onwikilink?: (click: WikiClick) => void;
		onsource?: (source: CitationSource) => void;
	} = $props();

	let copiedId = $state<number | null>(null);
	/** The source under the pointer, with the rect the card anchors to. */
	let hovered = $state<{ source: CitationSource; anchor: DOMRect } | null>(null);
	let cardEl = $state<HTMLElement | null>(null);
	/** Delays closing so the pointer can travel from the marker into the card. */
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	/** Rebuilds the trace and sources a saved message was answered from. */
	function savedTrace(message: AiMessageRecord) {
		const entries = toolTraceFromRecord(message.toolCalls, message.toolResults);
		return {
			entries,
			sources: collectCitations(entries),
			reasoning: message.reasoning,
			/** Persisted history has no measured duration, so it says "quickly". */
			seconds: 0
		};
	}

	/** Opens the preview card, cancelling any pending close. */
	function show(source: CitationSource, anchor: DOMRect) {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
		hovered = { source, anchor };
	}

	/** Closes after a short grace period so the pointer can reach the card. */
	function hide() {
		if (closeTimer) clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			hovered = null;
			closeTimer = null;
		}, 120);
	}

	/** Pins the card open while the pointer rests on it. */
	function keep() {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	}

	/**
	 * Anchors the card to the hovered element's rect. A virtual element stands
	 * in for the marker, so floating-ui flips the card below when there is no
	 * room above and shifts it inside the viewport.
	 */
	$effect(() => {
		const target = hovered;
		const card = cardEl;
		if (!target || !card) return;
		const { anchor } = target;
		const virtual = {
			getBoundingClientRect: () => anchor
		};
		void computePosition(virtual, card, {
			placement: 'top-start',
			middleware: [offset(8), flip(), shift({ padding: 8 })]
		}).then(({ x, y }) => {
			if (!cardEl) return;
			cardEl.style.left = `${x}px`;
			cardEl.style.top = `${y}px`;
		});
	});

	async function copy(id: number, content: string) {
		try {
			await navigator.clipboard.writeText(content);
			copiedId = id;
			setTimeout(() => (copiedId = null), 1500);
		} catch {
			/* clipboard denied: the text stays visible */
		}
	}
</script>

{#each messages as message (message.id)}
	<div class="flex flex-col gap-1 {message.role === 'user' ? 'items-end' : 'items-start'}">
		{#if message.role === 'assistant'}
			{@const trace = savedTrace(message)}
			{#if trace.reasoning}
				<AiReasoning content={trace.reasoning} seconds={trace.seconds} class="w-[92%]" />
			{/if}
			{#if trace.entries.length}
				<AiToolTrace entries={trace.entries} class="w-[92%]" />
			{/if}
			<div
				class="max-w-[92%] rounded-2xl bg-surface-container-lowest/40 px-3.5 py-2.5 text-body-sm font-body text-on-surface"
			>
				<AiMessageBody
					content={message.content}
					sources={trace.sources}
					{onwikilink}
					oncitation={onsource}
					oncitehover={show}
					onciteleave={hide}
					class="markdown-body markdown-body--compact"
				/>
			</div>
			{#if trace.sources.length}
				<AiSources
					sources={trace.sources}
					onsource={onsource}
					onhover={show}
					onleave={hide}
					class="w-[92%]"
				/>
			{/if}
		{:else}
			<div
				class="emphasis-container max-w-[92%] rounded-2xl px-3.5 py-2.5 text-body-sm font-body whitespace-pre-wrap text-on-primary-container"
			>
				{message.content}
			</div>
		{/if}
		<Button
			size="xs"
			variant="ghost"
			class="text-outline"
			onclick={() => void copy(message.id, message.content)}
		>
			{#if copiedId === message.id}<Check size={12} />{:else}<Copy size={12} />{/if}
			{copiedId === message.id ? t('ai.copied') : t('ai.copy')}
		</Button>
	</div>
{/each}

{#if hovered}
	<div bind:this={cardEl} class="fixed top-0 left-0 z-50">
		<AiCitationPopover
			source={hovered.source}
			{entities}
			onopen={(source) => {
				hovered = null;
				onsource?.(source);
			}}
			onkeep={keep}
			onleave={hide}
		/>
	</div>
{/if}
