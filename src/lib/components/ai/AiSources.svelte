<script lang="ts">
	import { ChevronDown, FileText, Globe, ListChecks } from '@lucide/svelte';
	import type { CitationSource } from '$lib/content/ai-citations';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The sources an answer drew on, as a collapsible list under the reply.
	 *
	 * Ported from the Svelte AI Elements `Sources` block rather than vendored:
	 * no shadcn `Collapsible`, just an explicit `<button>` + `$state`, matching
	 * `AiReasoning`/`AiToolTrace`. A note or task opens in the app; a web source
	 * opens in the user's browser. The list is derived from the turn's tool
	 * traffic, so it stays truthful to what actually ran.
	 */
	let {
		sources,
		/** Routes a note/task click the same way a wiki link does. */
		onsource,
		class: className = ''
	}: {
		sources: CitationSource[];
		onsource?: (source: CitationSource) => void;
		class?: string;
	} = $props();

	let open = $state(false);

	const summary = $derived(
		sources.length === 1
			? t('ai.sources.usedOne', { count: sources.length })
			: t('ai.sources.used', { count: sources.length })
	);

	function icon(kind: CitationSource['kind']) {
		if (kind === 'web') return Globe;
		if (kind === 'task') return ListChecks;
		return FileText;
	}
</script>

{#if sources.length}
	<div class="not-prose flex flex-col gap-1 rounded-xl bg-surface-container-lowest/40 {className}">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-label-sm font-label text-outline transition-colors hover:text-on-surface-variant"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<span class="flex-1 truncate">{summary}</span>
			<ChevronDown
				size={12}
				class="shrink-0 transition-transform {open ? 'rotate-180' : 'rotate-0'}"
			/>
		</button>
		{#if open}
			<ul class="flex flex-col gap-0.5 px-1.5 pb-1.5">
				{#each sources as source (source.kind + ':' + source.ref)}
					{@const Icon = icon(source.kind)}
					<li>
						<button
							type="button"
							class="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-container-lowest/60"
							onclick={() => onsource?.(source)}
						>
							<span
								class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest/80 text-label-sm font-label text-outline"
							>
								{source.index}
							</span>
							<Icon size={12} class="mt-0.5 shrink-0 text-outline" />
							<span class="flex min-w-0 flex-col">
								<span class="truncate text-label-sm font-label text-on-surface-variant">
									{source.title}
								</span>
								{#if source.description}
									<span class="line-clamp-2 text-label-sm font-label text-outline">
										{source.description}
									</span>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
