<script lang="ts">
	import { ArrowUpRight, FileText, Globe, ListChecks } from '@lucide/svelte';
	import { Button } from '$lib/components/base';
	import { citationPreview, hostOf, type CitationEntity, type CitationSource } from '$lib/content/ai-citations';
	import { t } from '$lib/i18n/index.svelte';

	/**
	 * The card shown when the user hovers a citation — inline `[n]` marker or a
	 * row in `AiSources` — so they can read what was cited without leaving the
	 * chat. A plain absolutely-positioned card, like `NoteDockCard`: the app has
	 * no hover-card primitive, and this must not force a navigation.
	 *
	 * It only presents; the parent owns hover state and the Open action, so a
	 * click still routes a note/task or opens a web page in the browser.
	 */
	let {
		source,
		/** Live notes/tasks, so the preview shows the current text. */
		entities = [],
		onopen,
		/** Keeps the card open while the pointer is over it. */
		onkeep,
		/** Tells the parent the pointer left the card, so it can close. */
		onleave
	}: {
		source: CitationSource;
		entities?: CitationEntity[];
		onopen: (source: CitationSource) => void;
		/** Keeps the card open while the pointer is over it. */
		onkeep?: () => void;
		onleave?: () => void;
	} = $props();

	const preview = $derived(citationPreview(source, entities));

	const label = $derived(
		source.kind === 'web'
			? hostOf(source.ref)
			: source.kind === 'task'
				? t('ai.sources.fromTask')
				: t('ai.sources.fromNote')
	);
	const openLabel = $derived(
		source.kind === 'web'
			? t('ai.sources.openWeb')
			: source.kind === 'task'
				? t('ai.sources.openTask')
				: t('ai.sources.openNote')
	);

	function icon(kind: CitationSource['kind']) {
		if (kind === 'web') return Globe;
		if (kind === 'task') return ListChecks;
		return FileText;
	}
</script>

{#snippet kindIcon()}
	{@const Icon = icon(source.kind)}
	<Icon size={12} />
{/snippet}

<div
	class="glass-solid pointer-events-auto flex w-72 flex-col gap-2 rounded-xl p-3 ring-1 ring-hairline"
	role="dialog"
	tabindex="-1"
	aria-label={source.title}
	onmouseenter={onkeep}
	onmouseleave={onleave}
>
	<div class="flex items-start justify-between gap-2">
		<span
			class="flex items-center gap-1.5 text-label-sm font-label font-semibold tracking-wider text-tertiary uppercase"
		>
			{@render kindIcon()}
			{label}
		</span>
		<span
			class="flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-label-sm font-label text-on-surface-variant"
		>
			{source.index}
		</span>
	</div>

	<h3 class="text-body-sm font-headline leading-tight text-on-surface">{source.title}</h3>

	{#if preview}
		<p class="scrollbar-none max-h-40 overflow-y-auto text-body-sm font-body leading-relaxed whitespace-pre-wrap text-on-surface-variant">
			{preview}
		</p>
	{:else}
		<p class="text-body-sm font-body text-outline">{t('ai.sources.noPreview')}</p>
	{/if}

	{#if source.kind === 'web'}
		<p class="truncate text-label-sm font-label text-outline">{source.ref}</p>
	{/if}

	<Button
		variant="tonal"
		size="sm"
		shape="tile"
		block
		class="gap-1.5"
		onclick={() => onopen(source)}
	>
		{openLabel}
		<ArrowUpRight size={13} />
	</Button>
</div>
