<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import AiMessageBody from '$lib/components/note/AiMessageBody.svelte';
	import AiReasoning from '$lib/components/ai/AiReasoning.svelte';
	import AiSources from '$lib/components/ai/AiSources.svelte';
	import AiToolTrace from '$lib/components/ai/AiToolTrace.svelte';
	import type { AiMessageRecord } from '$lib/content/ai-types';
	import type { WikiClick } from '$lib/content/wiki-links';
	import { collectCitations, type CitationSource } from '$lib/content/ai-citations';
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
	 */
	let {
		messages,
		onwikilink,
		onsource
	}: {
		messages: AiMessageRecord[];
		onwikilink?: (click: WikiClick) => void;
		onsource?: (source: CitationSource) => void;
	} = $props();

	let copiedId = $state<number | null>(null);

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
					class="markdown-body markdown-body--compact"
				/>
			</div>
			{#if trace.sources.length}
				<AiSources sources={trace.sources} onsource={onsource} class="w-[92%]" />
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
