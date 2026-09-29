<script lang="ts">
	import { CheckCircle2, ChevronDown, Loader2, Wrench, XCircle } from '@lucide/svelte';
	import {
		prettyArguments,
		prettyResult,
		toolResultSummary,
		toolTraceStatus,
		type ToolTraceEntry
	} from '$lib/content/ai-trace';
	import { toolLabel } from '$lib/content/ai-tool-schema';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The persisted record of what the assistant ran to answer a turn.
	 *
	 * Ported from the Svelte AI Elements `Tool` block: the collapsible card and
	 * the status badge are kept, while its shiki `code` renderer and `badge`
	 * dependency are replaced with a plain `<pre>` and the app's own tokens.
	 * Expanded results are the raw tool payload, which is what makes a past
	 * answer auditable.
	 */
	let { entries, class: className = '' }: { entries: ToolTraceEntry[]; class?: string } = $props();

	/** Per-call expanded/collapsed state, keyed by call id. */
	let expanded = $state<Record<string, boolean>>({});
	let allOpen = $state(false);

	const running = $derived(entries.some((entry) => !entry.result));
	const summary = $derived(
		entries.length === 1
			? running
				? t('ai.tools.runningOne', { count: entries.length })
				: t('ai.tools.ranOne', { count: entries.length })
			: running
				? t('ai.tools.running', { count: entries.length })
				: t('ai.tools.ran', { count: entries.length })
	);

	function toggleAll() {
		allOpen = !allOpen;
		expanded = Object.fromEntries(entries.map((entry) => [entry.call.id, allOpen]));
	}

	function toggle(id: string) {
		expanded = { ...expanded, [id]: !expanded[id] };
	}
</script>

{#if entries.length}
	<div class="not-prose flex flex-col gap-1.5 rounded-xl bg-surface-container-lowest/40 p-2 {className}">
		<div class="flex items-center gap-1.5 px-1 pt-0.5">
			<Wrench size={12} class="shrink-0 text-outline" />
			<span class="flex-1 text-label-sm font-label text-outline">{summary}</span>
			{#if !running}
				<button
					type="button"
					class="cursor-pointer text-label-sm font-label text-outline transition-colors hover:text-on-surface-variant"
					onclick={toggleAll}
				>
					{allOpen ? t('ai.tools.hideDetails') : t('ai.tools.showDetails')}
				</button>
			{/if}
		</div>

		{#each entries as entry (entry.call.id)}
			{@const status = toolTraceStatus(entry.result)}
			{@const hint = toolResultSummary(entry.result)}
			<div class="rounded-lg bg-surface-container-lowest/40">
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-label-sm font-label transition-colors hover:text-on-surface-variant"
					aria-expanded={Boolean(expanded[entry.call.id])}
					onclick={() => toggle(entry.call.id)}
				>
					{#if status === 'running'}
						<Loader2 size={12} class="shrink-0 animate-spin text-outline" />
					{:else if status === 'done'}
						<CheckCircle2 size={12} class="shrink-0 text-tertiary" />
					{:else}
						<XCircle size={12} class="shrink-0 text-error" />
					{/if}
					<span class="shrink-0 text-on-surface-variant">{toolLabel(entry.call.name)}</span>
					{#if hint}
						<span class="min-w-0 flex-1 truncate text-outline">· {hint}</span>
					{:else}
						<span class="flex-1"></span>
					{/if}
					<span
						class="shrink-0 text-label-sm {status === 'failed' || status === 'interrupted'
							? 'text-error'
							: 'text-outline'}"
					>
						{t('ai.toolStatus.' + status)}
					</span>
					<ChevronDown
						size={12}
						class="shrink-0 text-outline transition-transform {expanded[entry.call.id]
							? 'rotate-180'
							: 'rotate-0'}"
					/>
				</button>

				{#if expanded[entry.call.id]}
					<div class="flex flex-col gap-2 px-2 pb-2">
						<div class="flex flex-col gap-1">
							<span class="text-label-sm font-label text-outline">{t('ai.tools.parameters')}</span>
							<pre
								class="scrollbar-none max-h-40 overflow-auto rounded-md bg-surface-container-lowest/60 p-2 text-label-sm font-label text-on-surface-variant">{prettyArguments(
									entry.call.arguments
								)}</pre>
						</div>
						{#if entry.result}
							<div class="flex flex-col gap-1">
								<span class="text-label-sm font-label text-outline">
									{entry.result.ok ? t('ai.tools.result') : t('ai.tools.error')}
								</span>
								<pre
									class="scrollbar-none max-h-40 overflow-auto rounded-md p-2 text-label-sm font-label {entry.result.ok
										? 'bg-surface-container-lowest/60 text-on-surface-variant'
										: 'bg-error-container/30 text-on-error-container'}">{prettyResult(
										entry.result
									)}</pre>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
